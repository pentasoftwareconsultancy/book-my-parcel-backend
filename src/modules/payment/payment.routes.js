import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { sensitiveLimiter, paymentLimiter } from "../../middlewares/rateLimit.middleware.js";
import { createOrder, verifyPayment } from "./payment.controller.js";

const router = express.Router();

// Both payment endpoints require authentication and strict rate limiting
router.post("/create-order",   authMiddleware, paymentLimiter, createOrder);
router.post("/verify-payment", authMiddleware, paymentLimiter, verifyPayment);

export default router;
