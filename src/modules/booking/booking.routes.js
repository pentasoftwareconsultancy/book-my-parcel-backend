import express from "express";
import bookingController from "./booking.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { validateRequest, otpSchema, bookingIdSchema } from "./booking.validation.js";
import { otpGenerationLimiter, otpVerificationLimiter } from "../../middlewares/rateLimit.middleware.js";

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Pickup flow
router.post(
  "/:bookingId/start-pickup",
  otpGenerationLimiter,
  validateRequest(bookingIdSchema, "params"),
  bookingController.startPickup
);

router.post(
  "/:bookingId/verify-pickup",
  otpVerificationLimiter,
  validateRequest(bookingIdSchema, "params"),
  validateRequest(otpSchema, "body"),
  bookingController.verifyPickup
);

// Delivery flow
router.post(
  "/:bookingId/start-delivery",
  otpGenerationLimiter,
  validateRequest(bookingIdSchema, "params"),
  bookingController.startDelivery
);

router.post(
  "/:bookingId/verify-delivery",
  otpVerificationLimiter,
  validateRequest(bookingIdSchema, "params"),
  validateRequest(otpSchema, "body"),
  bookingController.verifyDelivery
);

export default router;
