import { Op } from "sequelize";
import Dispute from "./disputes.model.js";
import Booking from "../booking/booking.model.js";
import User from "../user/user.model.js";

// ─── Create Dispute ───────────────────────────────────────────────────────────
export async function createDisputeService({ booking_id, dispute_type, description, user, role }) {
  // Booking must exist
  const booking = await Booking.findByPk(booking_id);
  if (!booking) throw new Error("Booking not found");

  // Only allow disputes on active/completed bookings
  const allowedStatuses = ["CONFIRMED", "PICKUP", "IN_TRANSIT", "PAYMENT_PENDING", "DELIVERED"];
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
