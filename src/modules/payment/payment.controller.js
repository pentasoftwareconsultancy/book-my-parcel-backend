import {
  createOrderService,
  verifyPaymentService,
} from "./payment.service.js";
import { responseSuccess, responseError } from "../../utils/response.util.js";


/* CREATE ORDER */

export const createOrder = async (
  req,
  res
) => {

  try {

    const {
      parcel_id,
      amount
    } = req.body;

    /* Validate Input */

    if (!parcel_id || !amount) {
      return responseError(res, "parcel_id and amount are required", 400);
    }

    // Validate amount is a positive number
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return responseError(res, "amount must be a positive number", 400);
    }

    const order =
      await createOrderService(
        parcel_id,
        amount
      );

    // Return clean JSON object without Sequelize methods
    return responseSuccess(res, {
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        created_at: order.created_at
      },
      key: process.env.RAZORPAY_KEY_ID,
    }, "Order created successfully");

  } catch (error) {

    return responseError(res, error.message || "Order creation failed", 500);

  }

};


/* VERIFY PAYMENT */

export const verifyPayment = async (
  req,
  res
) => {

  try {

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      parcel_id
    } = req.body;

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !parcel_id) {
      return responseError(res, "Missing required payment verification fields", 400);
    }

    const result =
      await verifyPaymentService(
        req.body,
        req
      );

    if (result.success) {

      return responseSuccess(res, {}, "Payment verified successfully");

    } else {

      return responseError(res, "Payment failed", 400);

    }

  } catch (error) {

    return responseError(res, error.message || "Verification failed", 500);

  }

};