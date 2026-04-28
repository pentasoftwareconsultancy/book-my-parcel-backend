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
    console.log('[createOrder] Request body:', req.body);

    const {
      parcel_id,
      amount
    } = req.body;

    /* Validate Input */

    if (!parcel_id || !amount) {
      console.error('[createOrder] Missing required fields:', { parcel_id, amount });
      return res.status(400).json({
        success: false,
        message: "parcel_id and amount are required",
        received: { parcel_id: !!parcel_id, amount: !!amount }
      });
    }

    // Validate amount is a positive number
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      console.error('[createOrder] Invalid amount:', amount);
      return res.status(400).json({
        success: false,
        message: "amount must be a positive number"
      });
    }

    console.log('[createOrder] Creating order for parcel:', parcel_id, 'amount:', numAmount);

    const order =
      await createOrderService(
        parcel_id,
        amount
      );

    console.log('[createOrder] Order created successfully:', order);

    // Return clean JSON object without Sequelize methods
    res.status(200).json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        created_at: order.created_at
      },
      key: process.env.RAZORPAY_KEY_ID,
    });

  } catch (error) {

    console.error('[createOrder] Error:', error);
    console.error('[createOrder] Error stack:', error.stack);

    res.status(500).json({
      success: false,
      message: "Order creation failed",
      error: error.message,
    });

  }

};


/* VERIFY PAYMENT */

export const verifyPayment = async (
  req,
  res
) => {

  try {
    console.log('[verifyPayment] Request body:', req.body);

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      parcel_id
    } = req.body;

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !parcel_id) {
      console.error('[verifyPayment] Missing required fields:', {
        razorpay_order_id: !!razorpay_order_id,
        razorpay_payment_id: !!razorpay_payment_id,
        razorpay_signature: !!razorpay_signature,
        parcel_id: !!parcel_id
      });
      return res.status(400).json({
        success: false,
        message: "Missing required payment verification fields"
      });
    }

    const result =
      await verifyPaymentService(
        req.body,
        req
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