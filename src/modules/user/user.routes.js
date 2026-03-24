
import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { generalLimiter } from "../../middlewares/rateLimit.middleware.js";
import * as ctrl from "./user.controller.js";
import { getUserRequests } from "../parcel/parcel.controller.js";
import { storeFCMTokenEndpoint, removeFCMTokenEndpoint } from "./fcmToken.controller.js";

const router = express.Router();

// Apply rate limiting to all user routes
router.use(generalLimiter);

// ── Profile ──────────────────────────────
router.get("/userprofile",        authMiddleware, ctrl.getProfileController);
router.put("/userprofile/update", authMiddleware, ctrl.updateUserProfileController);

// ── Order Details ────────────────────────  ✅ add this
router.get("/orders/:bookingId",  authMiddleware, ctrl.getOrderDetails);
router.get(
  "/dashboard/orders",
  authMiddleware,
  getUserRequests
);

// ── FCM Tokens ───────────────────────────
router.post("/fcm-token", authMiddleware, storeFCMTokenEndpoint);
router.delete("/fcm-token", authMiddleware, removeFCMTokenEndpoint);

export default router;