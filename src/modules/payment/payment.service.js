import Razorpay from "razorpay";
import crypto from "crypto";

import Payment from "./payment.model.js";
import Booking from "../booking/booking.model.js";
import Parcel from "../parcel/parcel.model.js";
import User from "../user/user.model.js";
import Address from "../parcel/address.model.js";
import twilioService from "../../services/twilio.service.js";
import { sendToUser, sendToTraveller } from "../../services/notification.service.js";

import {
  BOOKING_STATUS,
  PAYMENT_STATUS
} from "../../utils/constants.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ================= CREATE ORDER ================= */

export const createOrderService = async (
  parcel_id,
  amount
) => {

  try {
    console.log('[createOrderService] Starting with parcel_id:', parcel_id, 'amount:', amount);

    /* Validate Parcel Exists */

    const parcel =
      await Parcel.findByPk(parcel_id);

    if (!parcel) {
      console.error('[createOrderService] Parcel not found:', parcel_id);
      throw new Error("Parcel not found");
    }

    console.log('[createOrderService] Parcel found:', parcel.id);

    /* Check Existing Pending Payment */

    const existingPayment =
      await Payment.findOne({
        where: {
          parcel_id: parcel_id,
          status: PAYMENT_STATUS.PENDING,
        },
      });

    if (existingPayment) {
      console.log('[createOrderService] Found existing pending payment:', existingPayment.razorpay_order_id);
      return {
        id: existingPayment.razorpay_order_id,
        amount: existingPayment.amount * 100,
        currency: "INR",
      };

    }

    const shortReceipt = `p_${parcel_id.replace(/-/g, '').substring(0, 30)}`;
    console.log('[createOrderService] Generated receipt:', shortReceipt);

    /* Create Razorpay Order */

    const options = {

      amount: amount * 100,

      currency: "INR",

      receipt: shortReceipt,

    };

    console.log('[createOrderService] Creating Razorpay order with options:', options);
    console.log('[createOrderService] Razorpay credentials check:', {
      key_id: process.env.RAZORPAY_KEY_ID ? 'SET' : 'MISSING',
      key_secret: process.env.RAZORPAY_KEY_SECRET ? 'SET' : 'MISSING'
    });

    const order =
      await razorpay.orders.create(options);

    console.log('[createOrderService] Razorpay order created:', order);

    /* Save Payment */

    const payment = await Payment.create({

      parcel_id: parcel_id, // storing parcel_id temporarily

      amount,

      currency: "INR",

      razorpay_order_id: order.id,

      status: PAYMENT_STATUS.PENDING,

    });

    console.log('[createOrderService] Payment record saved:', payment.id);

    return order;

  } catch (error) {

    console.error(
      "[createOrderService] Error:",
      error
    );
    console.error(
      "[createOrderService] Error stack:",
      error.stack
    );

    throw error;

  }

};

/* ================= VERIFY PAYMENT ================= */

export const verifyPaymentService = async (
  data,
  req = null
) => {

  try {

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      parcel_id
    } = data;

    /* Generate Signature */

    const body =
      razorpay_order_id +
      "|" +
      razorpay_payment_id;

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          process.env.RAZORPAY_KEY_SECRET
        )
        .update(body)
        .digest("hex");

    /* Verify Signature */

    if (
      expectedSignature === razorpay_signature
    ) {

      /* Update Payment */

      await Payment.update(
        {
          razorpay_payment_id,
          razorpay_signature,
          status: PAYMENT_STATUS.SUCCESS,
        },
        {
          where: {
            razorpay_order_id,
          },
        }
      );

      /* Verify parcel exists and belongs to the requesting user */

      const parcel = await Parcel.findByPk(parcel_id);

      if (!parcel) {
        throw new Error(
          "Parcel not found during booking"
        );
      }

      // Generate booking ID for Pay Now flow
      const { generateBookingId } = await import("../../utils/idGenerator.js");
      const bookingRef = await generateBookingId();

      const selectedPartnerId = parcel.selected_partner_id;

      if (!selectedPartnerId) {
        console.warn(`⚠️ [verifyPaymentService] No traveller ID provided for booking creation!`);
        console.warn(`   - parcel.selected_partner_id: ${selectedPartnerId}`);
      }

      const booking = await Booking.create({

        parcel_id:
          parcel.id,

        traveller_id:
          selectedPartnerId,

        status:
          BOOKING_STATUS.CONFIRMED,

        booking_ref:
          bookingRef,

        tracking_ref:
          null,

        payment_mode:
          'PAY_NOW'

      });

      // 🔥 LINK PAYMENT WITH BOOKING (THIS IS WHAT YOU ARE MISSING)
      await Payment.update(
        { booking_id: booking.id },
        {
          where: {
            razorpay_order_id,
          },
        }
      );
      // ✅ Update parcel status to CONFIRMED (was missing — caused status mismatch)
      await parcel.update({ status: "CONFIRMED" });

      console.log(`[verifyPaymentService] Booking created: ${bookingRef}, parcel status → CONFIRMED`);

      // ── Notify user (sender) — booking confirmed ──────────────────────
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

        // In-app notification
        await sendToUser(
          parcel.user_id,
          "Booking Confirmed! 🎉",
          `Your parcel from ${fromCity} to ${toCity} is confirmed. Booking ref: ${bookingRef}`,
          { type: "booking_confirmed", booking_id: booking.id, booking_ref: bookingRef }
        );

        // SMS to sender
        if (senderUser?.phone_number) {
          await twilioService.sendSMS(
            senderUser.phone_number,
            `Book My Parcel: Your booking is confirmed! Ref: ${bookingRef}. Your parcel from ${fromCity} to ${toCity} will be picked up soon.`
          );
        }

        // In-app notification to traveller
        if (selectedPartnerId) {
          await sendToTraveller(
            selectedPartnerId,
            "New Delivery Assigned 📦",
            `You have a new delivery: ${fromCity} → ${toCity}. Booking ref: ${bookingRef}`,
            { type: "booking_confirmed", booking_id: booking.id, booking_ref: bookingRef }
          );
        }
      } catch (notifErr) {
        console.error("[verifyPaymentService] Notification failed (non-fatal):", notifErr.message);
      }

      // ✅ Emit WebSocket events when booking is confirmed (Pay Now flow)
      if (selectedPartnerId && req?.app?.get("io")) {
        const io = req.app.get("io");

        console.log('🔌 Emitting WebSocket events for Pay Now booking confirmation (after payment):', {
          parcelId: parcel.id,
          bookingId: booking.id,
          bookingRef: booking.booking_ref,
          travellerId: selectedPartnerId
        });

        // Emit booking confirmation to selected traveller
        const bookingConfirmedData = {
          booking_id: booking.id,
          booking_ref: booking.booking_ref,
          parcel_id: parcel.id,
          parcel_uuid: parcel.id,
          parcel_ref: parcel.parcel_ref,
          final_price: parcel.price_quote,
          status: "CONFIRMED",
          payment_mode: booking.payment_mode,
          message: "Booking confirmed! Payment received. Proceed to pickup."
        };

        io.to(`traveller_requests_${selectedPartnerId}`).emit("booking_confirmed", bookingConfirmedData);
        console.log(`🔌 Emitted booking_confirmed to room traveller_requests_${selectedPartnerId}`, bookingConfirmedData);

        // ✅ Also emit to the parcel owner so their dashboard refreshes
        io.to(`user_${parcel.user_id}`).emit("booking_confirmed", {
          ...bookingConfirmedData,
          message: "Your booking is confirmed! Traveller will contact you for pickup.",
        });
        console.log(`🔌 Emitted booking_confirmed to room user_${parcel.user_id}`);
      }

      return {
        success: true
      };

    }

    /* If Signature Invalid */

    await Payment.update(
      {
        status: PAYMENT_STATUS.FAILED,
      },
      {
        where: {
          razorpay_order_id,
        },
      }
    );

    return {
      success: false
    };

  } catch (error) {

    console.error(
      "Verify Payment Error:",
      error
    );

    throw error;

  }

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
      console.log(`[Refund] No successful payment found for parcel ${parcelId} — skipping refund`);
      return { refunded: false };
    }

    // Already refunded — idempotency guard
    if (payment.status === PAYMENT_STATUS.REFUNDED) {
      console.log(`[Refund] Payment ${payment.id} already refunded — skipping`);
      return { refunded: false };
    }

    if (!payment.razorpay_payment_id) {
      console.warn(`[Refund] Payment ${payment.id} has no razorpay_payment_id — cannot refund`);
      return { refunded: false };
    }

    const amountPaise = Math.round(parseFloat(payment.amount) * 100); // Razorpay uses paise

    // Call Razorpay refund API
    const refundResponse = await razorpay.payments.refund(payment.razorpay_payment_id, {
      amount: amountPaise,
      notes: { reason, parcel_id: parcelId },
    });

    console.log(`[Refund] ✅ Razorpay refund created: ${refundResponse.id} for ₹${payment.amount}`);

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
    console.error(`[Refund] ❌ Failed to refund payment for parcel ${parcelId}:`, error.message);
    return { refunded: false, error: error.message };
  }
}
