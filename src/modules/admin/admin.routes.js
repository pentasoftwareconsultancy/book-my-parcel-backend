import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { fetchAllUsers, fetchAllBookings, fetchTravelersForKYC, updateKYCStatus, getRecentBookings, getAdminUserRoleStats, getActiveBookingCount, getTotalRevenue } from "./admin.controller.js";
import { validateStatus } from "../../utils/validation.util.js";

const router = express.Router();

router.get("/users", authMiddleware, fetchAllUsers);
router.get("/bookings", authMiddleware, fetchAllBookings);
router.get("/travellers/kyc", authMiddleware, fetchTravelersForKYC);
router.patch("/travellers/kyc/:id", authMiddleware, validateStatus, updateKYCStatus);
router.get("/recent", authMiddleware, getRecentBookings);
router.get("/usercounts", authMiddleware, getAdminUserRoleStats);
router.get("/bookingcount", authMiddleware, getActiveBookingCount);
router.get("/totalrevenue", authMiddleware, getTotalRevenue);

export default router;