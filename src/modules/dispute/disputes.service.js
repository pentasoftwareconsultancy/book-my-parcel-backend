import { Op } from "sequelize";
import sequelize from "../../config/database.config.js";
import Dispute from "./disputes.model.js";
import Booking from "../booking/booking.model.js";
import Parcel from "../parcel/parcel.model.js";
import User from "../user/user.model.js";
import { refundPaymentForParcel } from "../payment/payment.service.js";
import { creditWalletService } from "../payment/wallet.service.js";
import { createNotification } from "../notification/notification.service.js";
import { auditLog } from "../../utils/auditLog.util.js";
import app from "../../app.js";

// ─── Create Dispute ───────────────────────────────────────────────────────────
export async function createDisputeService({ booking_id, dispute_type, description, user, role }) {
  // Booking must exist
  const booking = await Booking.findByPk(booking_id);
  if (!booking) throw new Error("Booking not found");

  // Only allow disputes on active/completed bookings
  const allowedStatuses = ["CONFIRMED", "PICKUP", "IN_TRANSIT", "DELIVERED"];
  if (!allowedStatuses.includes(booking.status)) {
    throw new Error("Disputes can only be raised for active or completed bookings");
  }

  // One dispute per user per booking
  const existing = await Dispute.findOne({ where: { booking_id, raised_by: user.id } });
  if (existing) throw new Error("You have already raised a dispute for this booking");

  // ✅ Determine role: prefer explicitly provided role, fallback to activeRole, default to USER
  let finalRole = "USER";
  if (role) {
    finalRole = role === "TRAVELLER" ? "TRAVELLER" : "USER";
  } else if (user.activeRole === "TRAVELLER") {
    finalRole = "TRAVELLER";
  }

  const dispute = await Dispute.create({
    booking_id,
    raised_by: user.id,
    role: finalRole,
    dispute_type,
    description: description || null,
    status: "OPEN",
  });

  return dispute;
}

// ─── Get My Disputes ──────────────────────────────────────────────────────────
export async function getMyDisputesService(userId) {
  return Dispute.findAll({
    where: { raised_by: userId },
    include: [{
      model: Booking,
      attributes: ['id', 'traveller_id', 'user_id', 'status', 'amount'],
      required: false
    }],
    order: [["created_at", "DESC"]],
  });
}

// ─── Get Disputes Against Me (for Travellers) ────────────────────────────────
export async function getDisputesAgainstMeService(userId) {
  // Find all disputes where:
  // 1. The booking's traveller_id matches userId
  // 2. The dispute was raised BY someone else (raised_by != userId)
  // 3. The dispute was raised by a USER (not by traveller)
  return Dispute.findAll({
    include: [{
      model: Booking,
      where: { traveller_id: userId },
      attributes: ['id', 'traveller_id', 'user_id', 'status', 'amount'],
      required: true
    }],
    where: {
      raised_by: { [Op.ne]: userId },  // Not disputes I raised
      role: "USER"  // Only disputes raised by users
    },
    order: [["created_at", "DESC"]],
  });
}

// ─── Get Disputes Against Me (for Users — disputes raised by travellers) ─────────────
export async function getUserDisputesAgainstMeService(userId) {
  // Find all disputes where:
  // 1. The booking's user_id matches userId (the logged-in user)
  // 2. The dispute was raised BY someone else (raised_by != userId)
  // 3. The dispute was raised by a TRAVELLER (role: "TRAVELLER")
  return Dispute.findAll({
    include: [{
      model: Booking,
      where: { user_id: userId },
      attributes: ['id', 'traveller_id', 'user_id', 'status', 'amount', 'booking_ref', 'parcel_ref', 'tracking_ref'],
      required: true,
      include: [{
        model: User,
        as: "traveller",
        attributes: ['id', 'phone_number'],
        required: false,
      }],
    }],
    where: {
      raised_by: { [Op.ne]: userId },  // Not disputes I raised
      role: "TRAVELLER"  // Only disputes raised by travellers
    },
    order: [["created_at", "DESC"]],
  });
}

// ─── Resolve Dispute (Admin only) ────────────────────────────────────────────
/**
 * Resolve a dispute with one of three financial outcomes:
 *
 *   REFUND_USER      — Issue a Razorpay refund to the sender (PAY_NOW bookings)
 *                      or credit the sender's wallet (PAY_AFTER_DELIVERY bookings).
 *   RELEASE_TRAVELLER — Credit the traveller's wallet with the booking amount
 *                       (used when the dispute is ruled in the traveller's favour).
 *   NO_ACTION        — Close the dispute without any financial movement
 *                       (e.g. duplicate dispute, resolved offline).
 *
 * @param {string} disputeId
 * @param {{ resolution: string, admin_note?: string, adminId: string }} opts
 */
export async function resolveDisputeService({ disputeId, resolution, admin_note = "", adminId }) {
  const VALID_RESOLUTIONS = ["REFUND_USER", "RELEASE_TRAVELLER", "NO_ACTION"];

  if (!VALID_RESOLUTIONS.includes(resolution)) {
    const err = new Error(
      `Invalid resolution. Must be one of: ${VALID_RESOLUTIONS.join(", ")}`
    );
    err.statusCode = 400;
    throw err;
  }

  // ── Load dispute with booking + parcel ──────────────────────────────────────
  const dispute = await Dispute.findByPk(disputeId, {
    include: [
      {
        model: Booking,
        include: [
          { model: Parcel, as: "parcel", attributes: ["id", "user_id", "price_quote", "payment_mode"] },
        ],
      },
    ],
  });

  if (!dispute) {
    const err = new Error("Dispute not found");
    err.statusCode = 404;
    throw err;
  }

  if (dispute.status === "RESOLVED") {
    const err = new Error("Dispute is already resolved");
    err.statusCode = 409;
    throw err;
  }

  const booking = dispute.Booking;
  const parcel  = booking?.parcel;

  if (!booking) {
    const err = new Error("Booking linked to this dispute no longer exists");
    err.statusCode = 422;
    throw err;
  }

  const bookingAmount = Number(parcel?.price_quote || booking.amount || 0);
  const senderId      = parcel?.user_id;
  const travellerId   = booking.traveller_id;

  // Calculate platform fee and partner amount
  const { getPlatformFeePercent } = await import("../../redis/cache/platformSettingsCache.service.js");
  const platformFeePercent = await getPlatformFeePercent();
  const platformFee = Math.round(bookingAmount * (platformFeePercent / 100));
  const partnerAmount = bookingAmount - platformFee;

  let financialSummary = { action: "none" };

  // ── Execute financial action ────────────────────────────────────────────────
  if (resolution === "REFUND_USER") {
    // All payments are PAY_NOW - issue Razorpay refund
    const refundResult = await refundPaymentForParcel(
      parcel.id,
      `Dispute ${disputeId} resolved in favour of user by admin`
    );
    financialSummary = refundResult.refunded
      ? { action: "razorpay_refund", amount: refundResult.amount, refund_id: refundResult.refundId }
      : { action: "no_payment_to_refund" };
  } else if (resolution === "RELEASE_TRAVELLER") {
    // Credit traveller wallet with partner amount (after platform fee)
    if (partnerAmount > 0 && travellerId) {
      await creditWalletService(
        travellerId,
        partnerAmount,
        `Dispute ${disputeId} resolved - payment released (Amount: ₹${bookingAmount}, Platform fee: ₹${platformFee})`
      );
      financialSummary = { action: "wallet_credit_traveller", amount: partnerAmount, platformFee };
    } else {
      financialSummary = { action: "no_amount_to_release" };
    }
  }
  // NO_ACTION — no financial movement, just close the dispute

  // ── Mark dispute as RESOLVED ────────────────────────────────────────────────
  await dispute.update({
    status:     "RESOLVED",
    resolution,
    admin_note: admin_note || null,
    resolved_at: new Date(),
    resolved_by: adminId,
  });

  // ── Audit log ───────────────────────────────────────────────────────────────
  auditLog({
    action:       "DISPUTE_RESOLVED",
    actorId:      adminId,
    actorRole:    "admin",
    resourceType: "dispute",
    resourceId:   disputeId,
    meta: {
      resolution,
      admin_note,
      booking_id:       booking.id,
      financial_action: financialSummary,
    },
  });

  // ── Notify both parties (non-fatal) ─────────────────────────────────────────
  const io = app.get("io");
  try {
    const resolutionLabel =
      resolution === "REFUND_USER"       ? "Refund issued to sender"
      : resolution === "RELEASE_TRAVELLER" ? "Payment released to traveller"
      : "Closed without financial action";

    // Notify the person who raised the dispute
    await createNotification(io, {
      user_id:   dispute.raised_by,
      role:      dispute.role === "TRAVELLER" ? "traveller" : "user",
      type_code: "dispute_resolved",
      title:     "Your Dispute Has Been Resolved",
      message:   `Dispute for booking ${booking.booking_ref || booking.id} has been resolved. Outcome: ${resolutionLabel}.${admin_note ? ` Admin note: ${admin_note}` : ""}`,
      meta:      { dispute_id: disputeId, resolution, booking_id: booking.id },
    });

    // Notify the other party
    const otherPartyId   = dispute.role === "TRAVELLER" ? senderId   : travellerId;
    const otherPartyRole = dispute.role === "TRAVELLER" ? "user"      : "traveller";
    if (otherPartyId) {
      await createNotification(io, {
        user_id:   otherPartyId,
        role:      otherPartyRole,
        type_code: "dispute_resolved",
        title:     "Dispute Resolved",
        message:   `A dispute for booking ${booking.booking_ref || booking.id} has been resolved by admin. Outcome: ${resolutionLabel}.`,
        meta:      { dispute_id: disputeId, resolution, booking_id: booking.id },
      });
    }
  } catch (notifErr) {
    console.warn("[Dispute] Notification failed (non-fatal):", notifErr.message);
  }

  return {
    dispute_id:       disputeId,
    resolution,
    financial_action: financialSummary,
    resolved_at:      dispute.resolved_at,
  };
}

// ─── Update Dispute Status (Admin: OPEN → IN_PROGRESS) ───────────────────────
/**
 * Allows admin to move a dispute to IN_PROGRESS while investigating.
 * Resolution is handled separately via resolveDisputeService.
 */
export async function updateDisputeStatusService({ disputeId, status, adminId }) {
  const ALLOWED = ["IN_PROGRESS"];   // only non-terminal transition via this path
  if (!ALLOWED.includes(status)) {
    const err = new Error(`Use the resolve endpoint to set status to RESOLVED. Allowed here: ${ALLOWED.join(", ")}`);
    err.statusCode = 400;
    throw err;
  }

  const dispute = await Dispute.findByPk(disputeId);
  if (!dispute) {
    const err = new Error("Dispute not found");
    err.statusCode = 404;
    throw err;
  }
  if (dispute.status === "RESOLVED") {
    const err = new Error("Cannot change status of a resolved dispute");
    err.statusCode = 409;
    throw err;
  }

  await dispute.update({ status });

  auditLog({
    action:       "DISPUTE_STATUS_UPDATED",
    actorId:      adminId,
    actorRole:    "admin",
    resourceType: "dispute",
    resourceId:   disputeId,
    meta:         { new_status: status },
  });

  return dispute;
}
