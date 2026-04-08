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
  data
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

      await Booking.create({

        user_id:
          parcel.user_id,

        parcel_id:
          parcel.id,

        status:
          BOOKING_STATUS.CONFIRMED

      });

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