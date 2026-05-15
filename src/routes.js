import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";
import feedbackRoutes from "./modules/feedback/feedback.routes.js";
import disputeRoutes from "./modules/dispute/disputes.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import parcelRoutes from "./modules/parcel/parcel.routes.js"
import userRoutes from "./modules/user/user.routes.js";
import travellerRoutes from "./modules/traveller/traveller.routes.js";
import travellerRouteRoutes from "./modules/traveller/travellerRoute.routes.js";
import placesRoutes from "./modules/places/places.routes.js";
import matchingRoutes from "./modules/matching/matching.routes.js";
import ParcelTracking from "./modules/tracking/parcelTracking.routes.js";
import bookingRoutes from "./modules/booking/booking.routes.js";
import paymentRoutes from "./modules/payment/payment.routes.js";
import withdrawalRoutes from "./modules/payment/withdrawal.routes.js";
import testRedisRoutes from "./routes/test-redis.js";
import testRedisFeaturesRoutes from "./routes/test-redis-features.js";
import queueMonitorRoutes from "./routes/queue-monitor.routes.js";

import notificationRoutes from "./modules/notification/notification.routes.js";
import kycRoutes from "./modules/kyc/kyc.routes.js";

const router = express.Router();

// Version info endpoint
router.get("/version", (req, res) => {
  res.json({
    success: true,
    data: {
      api_version: "v1",
      app_version: "1.0.0",
      environment: process.env.NODE_ENV || "development",
    },
  });
});

// Module routes
router.use("/auth", authRoutes);
router.use("/feedback", feedbackRoutes);
router.use("/dispute", disputeRoutes);   // /api/dispute, /api/dispute/my
router.use("/user", userRoutes); // /api/user/...
router.use("/places", placesRoutes); // /api/places/autocomplete

router.use("/tracking", ParcelTracking); // /api/tracking/...

// Payment routes (Razorpay orders and verification)
router.use("/payment", paymentRoutes); // /api/payment/create-order, /api/payment/verify-payment

// Payment routes (wallet, withdrawal)
router.use("/payment", withdrawalRoutes); // /api/payment/wallet/*, /api/payment/withdrawal/*, /api/payment/kyc/*

//Travller Routes
// Booking routes (OTP verification for pickup/delivery)
router.use("/booking", bookingRoutes); // /api/booking/:id/start-pickup, verify-pickup, start-delivery, verify-delivery

// Parcel routes (includes matching endpoints for parcel owners)
router.use("/parcel", parcelRoutes); // /api/parcel/...
router.use("/parcel", matchingRoutes); // /api/parcel/:id/find-travellers, /api/parcel/:id/acceptances, /api/parcel/:id/select-traveller, /api/parcel/:id/route-geometry

// Traveller routes (includes matching endpoints for travellers)
router.use("/traveller", travellerRoutes); // /api/traveller/...
router.use("/traveller/routes", travellerRouteRoutes); // /api/traveller/routes/...
router.use("/traveller", matchingRoutes); // /api/traveller/requests, /api/traveller/requests/:requestId/accept, /api/traveller/requests/:requestId/express-interest, /api/traveller/requests/:requestId/reject

// Matching admin/testing routes
router.use("/matching", matchingRoutes); // /api/matching/run-periodic, /api/matching/test-parcel/:id, /api/matching/test-traveller-requests/:travellerId

// Admin routes
router.use("/admin", adminRoutes); // /api/admin/...

// Notification routes
router.use("/notifications", notificationRoutes); // /api/notifications

//KYC ROUTES
router.use("/kyc", kycRoutes); // /api/kyc/...

// Redis test route (for development/testing)
router.use("/test-redis", testRedisRoutes); // /api/test-redis

// Redis features test route (comprehensive testing)
router.use("/test-redis-features", testRedisFeaturesRoutes); // /api/test-redis-features

// Queue monitor (Redis/BullMQ observability)
router.use("/queues", queueMonitorRoutes); // /api/queues/health

export default router;
