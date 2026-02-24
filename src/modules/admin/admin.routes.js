import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { fetchAllUsers, fetchAllBookings, fetchTravelersForKYC, updateKYCStatus } from "./admin.controller.js";
import { validateStatus } from "../../utils/validation.util.js";

const router = express.Router();

router.get("/users", authMiddleware, fetchAllUsers);
router.get("/bookings", authMiddleware, fetchAllBookings);
router.get("/travellers/kyc", authMiddleware, fetchTravelersForKYC);
router.patch("/travellers/kyc/:id", authMiddleware, validateStatus, updateKYCStatus);

export default router;