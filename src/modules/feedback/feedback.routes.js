import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { generalLimiter, sensitiveLimiter } from "../../middlewares/rateLimit.middleware.js";
import {
  submitFeedbackController,
  getBookingFeedbackController,
  getTravellerFeedbackController,
  updateFeedbackController,
} from "./feedback.controller.js";

const router = express.Router();

router.use(generalLimiter);

// Submit feedback — strict limit (once per booking, but prevent spam)
router.post("/submit", authMiddleware, sensitiveLimiter, submitFeedbackController);

// Check if feedback exists for a booking
router.get("/booking/:bookingId", authMiddleware, getBookingFeedbackController);

// Update existing feedback
router.put("/booking/:bookingId", authMiddleware, sensitiveLimiter, updateFeedbackController);

// Public — anyone can view a traveller's reviews
router.get("/traveller/:travellerId", getTravellerFeedbackController);

export default router;
