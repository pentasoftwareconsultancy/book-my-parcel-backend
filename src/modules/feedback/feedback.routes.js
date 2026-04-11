import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

import { generalLimiter } from "../../middlewares/rateLimit.middleware.js";

import {
  submitFeedbackController,
  getBookingFeedbackController,
  getTravellerFeedbackController,
  updateFeedbackController,
} from "./feedback.controller.js";

const router = express.Router();

// Apply rate limiting to all feedback routes
router.use(generalLimiter);

router.post("/submit", authMiddleware, submitFeedbackController);

// Used by frontend to check if feedback already exists for a booking
router.get("/booking/:bookingId", authMiddleware, getBookingFeedbackController);

// Update existing feedback (edit mode)
router.put("/booking/:bookingId", authMiddleware, updateFeedbackController);

// GET /api/feedback/traveller/:travellerId
// Public — anyone can view a traveller's reviews (no auth required)
router.get("/traveller/:travellerId", getTravellerFeedbackController);

export default router;
