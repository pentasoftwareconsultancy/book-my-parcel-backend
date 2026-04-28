
import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { generalLimiter } from "../../middlewares/rateLimit.middleware.js";
import * as ctrl from "./user.controller.js";
import { getUserRequests } from "../parcel/parcel.controller.js";
import { storeFCMTokenEndpoint, removeFCMTokenEndpoint } from "./fcmToken.controller.js";
import paymentRoutes from "../payment/payment.routes.js";
import feedback from "../feedback/feedback.routes.js";
import { getReferralStats } from "../../services/referral.service.js";

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
router.use("/payment", authMiddleware, paymentRoutes);

// ── Referral ─────────────────────────────
router.get("/referral/stats", authMiddleware, async (req, res) => {
  try {
    const stats = await getReferralStats(req.user.id);
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Feedback ─────────────────
router.use("/feedback", feedback);


export default router;