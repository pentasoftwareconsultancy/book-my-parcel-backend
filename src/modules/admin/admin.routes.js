import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { fetchAllUsers, fetchAllBookings, fetchTravelersForKYC, updateKYCStatus, getAdminDashboard, getAllDisputesController, getAllPaymentsAdminController } from "./admin.controller.js";
import { requireAdmin } from "../../middlewares/role.middleware.js";
import { sensitiveLimiter } from "../../middlewares/rateLimit.middleware.js";
import { validateStatus } from "../../utils/validation.util.js";

const router = express.Router();

// All admin routes require authentication, admin role, and rate limiting
router.get("/users", authMiddleware, requireAdmin, sensitiveLimiter, fetchAllUsers);
router.get("/bookings", authMiddleware, requireAdmin, sensitiveLimiter, fetchAllBookings);
router.get("/travellers/kyc", authMiddleware, requireAdmin, sensitiveLimiter, fetchTravelersForKYC);
router.patch("/travellers/kyc/:id", authMiddleware, requireAdmin, sensitiveLimiter, validateStatus, updateKYCStatus);
router.get("/dashboardoverview", authMiddleware, requireAdmin, getAdminDashboard);
router.get("/disputes", authMiddleware, requireAdmin, getAllDisputesController);
router.get("/payments", authMiddleware, requireAdmin, getAllPaymentsAdminController);


export default router;