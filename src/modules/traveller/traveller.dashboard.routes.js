import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import * as ctrl from "./traveller.controller.js";
import { generalLimiter } from "../../middlewares/rateLimit.middleware.js";

const router = express.Router(); 

// Traveler dashboard endpoints (protected)
router.get("/dashboard/deliveries", authMiddleware, generalLimiter, ctrl.getTravelerDeliveries);
router.get("/dashboard/stats", authMiddleware, generalLimiter, ctrl.getTravelerStats);
router.get("/dashboard/bookings/:bookingId", authMiddleware, generalLimiter, ctrl.getTravelerBookingDetails);


export default router;
