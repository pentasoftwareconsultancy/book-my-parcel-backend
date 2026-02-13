import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";
import bookingRoutes from "./modules/booking/booking.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";

const router = express.Router();

// Module routes
router.use("/auth", authRoutes); // /api/auth/...
router.use("/booking", bookingRoutes); // /api/booking/...

// Admin Routes
router.use("/admin", adminRoutes); // /api/admin/...

export default router;
