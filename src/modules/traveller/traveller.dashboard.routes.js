import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import * as ctrl from "./traveller.controller.js";

const router = express.Router();

// Traveler dashboard endpoints (protected)
router.get("/dashboard/deliveries", authMiddleware, ctrl.getTravelerDeliveries);
router.get("/dashboard/stats", authMiddleware, ctrl.getTravelerStats);

export default router;