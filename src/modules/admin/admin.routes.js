import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireAdmin } from "../../middlewares/role.middleware.js";
import { sensitiveLimiter } from "../../middlewares/rateLimit.middleware.js";
import { fetchAllUsers, fetchAllBookings, fetchTravelersForKYC, updateKYCStatus, getRecentBookings, getAdminUserRoleStats, getActiveBookingCount, getTotalRevenue } from "./admin.controller.js";
import { validateStatus } from "../../utils/validation.util.js";

const router = express.Router();

// All admin routes require authentication, admin role, and rate limiting
router.get("/users", authMiddleware, requireAdmin, sensitiveLimiter, fetchAllUsers);
router.get("/bookings", authMiddleware, requireAdmin, sensitiveLimiter, fetchAllBookings);
router.get("/travellers/kyc", authMiddleware, requireAdmin, sensitiveLimiter, fetchTravelersForKYC);
router.patch("/travellers/kyc/:id", authMiddleware, requireAdmin, sensitiveLimiter, validateStatus, updateKYCStatus);
router.get("/recent", authMiddleware, requireAdmin, sensitiveLimiter, getRecentBookings);
router.get("/usercounts", authMiddleware, requireAdmin, sensitiveLimiter, getAdminUserRoleStats);
router.get("/bookingcount", authMiddleware, requireAdmin, sensitiveLimiter, getActiveBookingCount);
router.get("/totalrevenue", authMiddleware, requireAdmin, sensitiveLimiter, getTotalRevenue);

export default router;