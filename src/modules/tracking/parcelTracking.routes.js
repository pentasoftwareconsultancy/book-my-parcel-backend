// modules/tracking/parcelTracking.routes.js
import express from "express";
import {
  handleInitiateTracking,
  handleUpdateLocation,
  handleGetTracking,
  handleCompleteDelivery,
  handleUploadProof,
} from "./parcelTracking.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { authorizeRoles } from "../../middlewares/tracking.middleware.js";
import { upload } from "../../utils/fileUpload.util.js";
import { generalLimiter, sensitiveLimiter } from "../../middlewares/rateLimit.middleware.js";

const router = express.Router();

// ── Public route — no auth needed (shareable tracking link) ──────────────────
// Anyone with the booking_id can view live location (no sensitive data exposed)
router.get("/public/:booking_id", generalLimiter, handleGetTracking);

// ── Authenticated routes ──────────────────────────────────────────────────────
router.use(authMiddleware, generalLimiter);

router.post  ("/initiate",    sensitiveLimiter, authorizeRoles("TRAVELLER"),           handleInitiateTracking);
router.patch ("/location",    sensitiveLimiter, authorizeRoles("TRAVELLER"),           handleUpdateLocation);
router.get   ("/:booking_id", authorizeRoles("INDIVIDUAL", "ADMIN"), handleGetTracking);
router.patch ("/complete",    sensitiveLimiter, authorizeRoles("TRAVELLER"),           handleCompleteDelivery);

// ── Proof of delivery / pickup photo upload ───────────────────────────────────
router.post(
  "/proof",
  sensitiveLimiter,
  authorizeRoles("TRAVELLER"),
  upload.single("proof_photo"),
  handleUploadProof
);

export default router;
