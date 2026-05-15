import {
  createOrderService,
  verifyPaymentService,
} from "./payment.service.js";


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

      return res.status(400).json({
        success: false,
        message:
          "parcel_id and amount required",
      });

    }

    const order =
      await createOrderService(
        parcel_id,
        amount
      );

    res.status(200).json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Order creation failed",
    });

  }

};


/* VERIFY PAYMENT */

export const verifyPayment = async (
  req,
  res
) => {

  try {

    const result =
      await verifyPaymentService(
        req.body
      );

    if (result.success) {

      res.status(200).json({
        success: true,
        message:
          "Payment verified successfully",
      });

    } else {

      res.status(400).json({
        success: false,
        message: "Payment failed",
      });

    }

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message:
        "Verification failed",
    });

  }

};