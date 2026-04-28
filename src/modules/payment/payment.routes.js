import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { sensitiveLimiter } from "../../middlewares/rateLimit.middleware.js";
import { createOrder, verifyPayment } from "./payment.controller.js";

const router = express.Router();

// Both payment endpoints require authentication and strict rate limiting
router.post("/create-order",   authMiddleware, sensitiveLimiter, createOrder);
router.post("/verify-payment", authMiddleware, sensitiveLimiter, verifyPayment);

export default router;
