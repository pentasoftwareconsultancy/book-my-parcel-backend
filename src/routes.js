import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";
import bookingRoutes from "./modules/booking/booking.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import parcelRoutes from "./modules/parcel/parcel.routes.js"
import userRoutes from "./modules/user/user.routes.js";
import travellerRoutes from "./modules/traveller/traveller.routes.js";
import travellerDashboardRoutes from "./modules/traveller/traveller.dashboard.routes.js";
const router = express.Router();

// Module routes
router.use("/auth", authRoutes); // /api/auth/...
router.use("/booking", bookingRoutes); // /api/booking/
router.use("/parcel", parcelRoutes); // /api/parcel/
router.use("/user", userRoutes); // /api/user/...
router.use("/traveller", travellerRoutes); // /api/traveller/...
router.use("/traveller", travellerDashboardRoutes); // /api/traveller/dashboard/...

// Admin Routes
router.use("/admin", adminRoutes); // /api/admin/...



router.use("/traveller", travellerRoutes)
export default router;
