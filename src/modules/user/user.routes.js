
import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import * as ctrl from "./user.controller.js";
import { getUserRequests } from "../parcel/parcel.controller.js";
import { storeFCMTokenEndpoint, removeFCMTokenEndpoint } from "./fcmToken.controller.js";
import paymentRoutes from "../payment/payment.routes.js";

const router = express.Router();

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


export default router;