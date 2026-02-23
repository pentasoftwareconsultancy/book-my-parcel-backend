import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import * as ctrl from "./user.controller.js";

const router = express.Router();

// User dashboard endpoints (protected)
router.get("/dashboard/orders", authMiddleware, ctrl.getUserOrders);
router.get("/dashboard/stats", authMiddleware, ctrl.getUserStats);

export default router;