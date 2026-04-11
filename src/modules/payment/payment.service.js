import Razorpay from "razorpay";
import crypto from "crypto";

import Payment from "./payment.model.js";
import Booking from "../booking/booking.model.js";
import Parcel from "../parcel/parcel.model.js"; // ✅ MISSING IMPORT

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
      await razorpay.orders.create(options);

    /* Save Payment */

    await Payment.create({

      parcel_id: parcel_id, // storing parcel_id temporarily

      amount,

      currency: "INR",

      razorpay_order_id: order.id,

      status: PAYMENT_STATUS.PENDING,

    });

    return order;

  } catch (error) {

    console.error(
      "Create Order Error:",
      error
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

      /* CREATE BOOKING AFTER PAYMENT */

      const parcel =
        await Parcel.findByPk(parcel_id);

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

      console.log(`[verifyPaymentService] Booking created with ID: ${bookingRef} for traveller: ${selectedPartnerId}`);

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