import Razorpay from "razorpay";
import crypto from "crypto";

import sequelize from "../../config/database.config.js";
import Payment from "./payment.model.js";
import Booking from "../booking/booking.model.js";
import Parcel from "../parcel/parcel.model.js";
import User from "../user/user.model.js";
import Address from "../parcel/address.model.js";
import twilioService from "../../services/twilio.service.js";
import { sendToUser, sendToTraveller } from "../../services/notification.service.js";
import { auditLog } from "../../utils/auditLog.util.js";

import {
  BOOKING_STATUS,
  PARCEL_TRANSITIONS,
  PAYMENT_STATUS,
  assertValidTransition,
} from "../../utils/constants.js";

let _razorpay = null;

function getRazorpay() {
  if (!_razorpay) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error(
        "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your .env file."
      );
    }
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return _razorpay;
}

/* ================= CREATE ORDER ================= */

export const createOrderService = async (
  parcel_id,
  amount
) => {

  try {

    /* Validate Parcel Exists */

    const parcel =
      await Parcel.findByPk(parcel_id);

    if (!parcel) {
      throw new Error("Parcel not found");
    }

    /* Check Existing Pending Payment */

    const existingPayment =
      await Payment.findOne({
        where: {
          parcel_id: parcel_id,
          status: PAYMENT_STATUS.PENDING,
        },
      });

    if (existingPayment) {
      return {
        id: existingPayment.razorpay_order_id,
        amount: existingPayment.amount * 100,
        currency: "INR",
      };

    }

    const shortReceipt = `p_${parcel_id.replace(/-/g, '').substring(0, 30)}`;

    /* Create Razorpay Order */

    const options = {

      amount: amount * 100,

      currency: "INR",

      receipt: shortReceipt,

    };

    const order =
      await getRazorpay().orders.create(options);

    /* Save Payment */

    await Payment.create({
      parcel_id: parcel_id,
      amount,
      currency: "INR",
      razorpay_order_id: order.id,
      status: PAYMENT_STATUS.PENDING,
    });

    return order;

  } catch (error) {

    throw error;

  }

};

/* ================= VERIFY PAYMENT ================= */

export const verifyPaymentService = async (data, req = null) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    parcel_id,
  } = data;

  // ── 1. Verify Razorpay signature BEFORE touching the DB ──────────────────
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const signatureValid = expectedSignature === razorpay_signature;

  if (!signatureValid) {
    // Mark payment as failed — no booking created
    await Payment.update(
      { status: PAYMENT_STATUS.FAILED },
      { where: { razorpay_order_id } }
    );
    return { success: false };
  }

  // ── 2. Idempotency check — has this order already been processed? ─────────
  // Razorpay can fire the same webhook more than once. If a payment record
  // for this order is already SUCCESS and linked to a booking, return
  // immediately without creating a duplicate.
  const existingPayment = await Payment.findOne({
    where: { razorpay_order_id, status: PAYMENT_STATUS.SUCCESS },
  });

  if (existingPayment?.booking_id) {
    console.log(
      `[Payment] Duplicate callback for order ${razorpay_order_id} — booking ${existingPayment.booking_id} already exists. Skipping.`
    );
    return {
      success: true,
      booking_id: existingPayment.booking_id,
      duplicate: true,
    };
  }

  // ── 3. Wrap all DB writes in a single transaction ─────────────────────────
  // This guarantees that the Payment update, Booking creation, and Parcel
  // status update either ALL succeed or ALL roll back. The UNIQUE constraint
  // on payments.razorpay_order_id is the final safety net: if two concurrent
  // requests somehow both pass the idempotency check above, the second
  // Booking.create will throw a UniqueConstraintError and the transaction
  // will be rolled back automatically.
  const { booking, parcel, bookingRef } = await sequelize.transaction(
    async (t) => {
      // 3a. Verify parcel exists
      const parcel = await Parcel.findByPk(parcel_id, { transaction: t });
      if (!parcel) {
        throw new Error("Parcel not found during payment verification");
      }

      // 3b. Mark payment as SUCCESS and capture payment details
      const [updatedCount] = await Payment.update(
        {
          razorpay_payment_id,
          razorpay_signature,
          status: PAYMENT_STATUS.SUCCESS,
        },
        { where: { razorpay_order_id }, transaction: t }
      );

      if (updatedCount === 0) {
        throw new Error(
          `Payment record not found for order ${razorpay_order_id}`
        );
      }

      // 3c. Generate booking reference
      const { generateBookingId } = await import("../../utils/idGenerator.js");
      const bookingRef = await generateBookingId();

      const selectedPartnerId = parcel.selected_partner_id;

      // 3d. Create booking — the UNIQUE constraint on razorpay_order_id (via
      // the linked Payment) prevents a second booking from being created if
      // a concurrent request races past the idempotency check above.
      const booking = await Booking.create(
        {
          parcel_id: parcel.id,
          traveller_id: selectedPartnerId,
          status: BOOKING_STATUS.CONFIRMED,
          booking_ref: bookingRef,
          tracking_ref: null,
          payment_mode: "PAY_NOW",
        },
        { transaction: t }
      );

      // 3e. Link payment → booking
      await Payment.update(
        { booking_id: booking.id },
        { where: { razorpay_order_id }, transaction: t }
      );

      // 3f. Update parcel status — guard the transition
      assertValidTransition(parcel.status, "CONFIRMED", PARCEL_TRANSITIONS, "Parcel");
      await parcel.update({ status: "CONFIRMED" }, { transaction: t });

      return { booking, parcel, bookingRef };
    }
  );

  // ── 4. Post-transaction side-effects (notifications, WebSocket) ───────────
  // These run AFTER the transaction commits. Failures here are non-fatal —
  // the booking is already persisted.
  try {
    const parcelWithAddresses = await Parcel.findByPk(parcel_id, {
      include: [
        { model: Address, as: "pickupAddress", attributes: ["city"] },
        { model: Address, as: "deliveryAddress", attributes: ["city"] },
      ],
    });
    const senderUser = await User.findByPk(parcel.user_id);
    const fromCity = parcelWithAddresses?.pickupAddress?.city || "pickup";
    const toCity = parcelWithAddresses?.deliveryAddress?.city || "delivery";
    const selectedPartnerId = parcel.selected_partner_id;

    // In-app notifications
    await sendToUser(
      parcel.user_id,
      "Booking Confirmed! 🎉",
      `Your parcel from ${fromCity} to ${toCity} is confirmed. Booking ref: ${bookingRef}`,
      { type: "booking_confirmed", booking_id: booking.id, booking_ref: bookingRef }
    );

    if (selectedPartnerId) {
      await sendToTraveller(
        selectedPartnerId,
        "New Delivery Assigned 📦",
        `You have a new delivery: ${fromCity} → ${toCity}. Booking ref: ${bookingRef}`,
        { type: "booking_confirmed", booking_id: booking.id, booking_ref: bookingRef }
      );
    }

    // SMS to sender
    if (senderUser?.phone_number) {
      await twilioService.sendSMS(
        senderUser.phone_number,
        `Book My Parcel: Your booking is confirmed! Ref: ${bookingRef}. Your parcel from ${fromCity} to ${toCity} will be picked up soon.`
      );
    }

    // WebSocket events
    if (selectedPartnerId && req?.app?.get("io")) {
      const io = req.app.get("io");
      const bookingConfirmedData = {
        booking_id: booking.id,
        booking_ref: booking.booking_ref,
        parcel_id: parcel.id,
        parcel_uuid: parcel.id,
        parcel_ref: parcel.parcel_ref,
        final_price: parcel.price_quote,
        status: "CONFIRMED",
        payment_mode: booking.payment_mode,
        message: "Booking confirmed! Payment received. Proceed to pickup.",
      };

      io.to(`traveller_requests_${selectedPartnerId}`).emit(
        "booking_confirmed",
        bookingConfirmedData
      );
      io.to(`user_${parcel.user_id}`).emit("booking_confirmed", {
        ...bookingConfirmedData,
        message: "Your booking is confirmed! Traveller will contact you for pickup.",
      });
    }
  } catch (notifErr) {
    // Non-fatal — booking is already confirmed. Log so we can debug.
    console.error(
      "[Payment] Post-confirmation notification/WebSocket error:",
      notifErr.message
    );
  }

  auditLog({
    action:       "PAYMENT_VERIFIED",
    actorId:      parcel.user_id,
    actorRole:    "user",
    resourceType: "payment",
    resourceId:   razorpay_order_id,
    meta:         { parcel_id, booking_id: booking.id, amount: parcel.price_quote },
    req,
  });

  return { success: true, booking_id: booking.id };
};

/* ================= REFUND PAYMENT ================= */

/**
 * Issue a Razorpay refund for a parcel cancellation.
 * - Finds the SUCCESS payment for the parcel
 * - Calls Razorpay refund API
 * - Creates a Refund record
 * - Updates Payment status to REFUNDED
 *
 * Safe to call even if no payment exists (pre-payment cancellations).
 *
 * @param {string} parcelId
 * @param {string} reason  - Short reason string for Razorpay notes
 * @returns {{ refunded: boolean, amount?: number, refundId?: string }}
 */
export async function refundPaymentForParcel(parcelId, reason = "Parcel cancelled by user") {
  try {
    // Find the successful payment for this parcel
    const payment = await Payment.findOne({
      where: {
        parcel_id: parcelId,
        status: PAYMENT_STATUS.SUCCESS,
      },
    });

    // No payment found — parcel was cancelled before payment (nothing to refund)
    if (!payment) {
      return { refunded: false };
    }

    // Already refunded — idempotency guard
    if (payment.status === PAYMENT_STATUS.REFUNDED) {
      return { refunded: false };
    }

    if (!payment.razorpay_payment_id) {
      return { refunded: false };
    }

    const amountPaise = Math.round(parseFloat(payment.amount) * 100); // Razorpay uses paise

    // Call Razorpay refund API
    const refundResponse = await getRazorpay().payments.refund(payment.razorpay_payment_id, {
      amount: amountPaise,
      notes: { reason, parcel_id: parcelId },
    });

    // Lazy-import Refund model to avoid circular deps
    const { default: Refund } = await import("./refund.model.js");

    // Persist refund record
    await Refund.create({
      payment_id: payment.id,
      amount: payment.amount,
      status: "COMPLETED",
    });

    // Mark payment as refunded
    await payment.update({ status: PAYMENT_STATUS.REFUNDED });

    return {
      refunded: true,
      amount: payment.amount,
      refundId: refundResponse.id,
    };
  } catch (error) {
    // Non-fatal — log and continue. Cancellation should still succeed even if refund fails.
    return { refunded: false, error: error.message };
  }
}
