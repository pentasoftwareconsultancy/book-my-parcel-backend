import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";
import bookingRoutes from "./modules/booking/booking.routes.js";
import travellerRoutes from "./modules/traveller/traveller.routes.js";
const router = express.Router();

// Module routes
router.use("/auth", authRoutes); // /api/auth/...
router.use("/booking", bookingRoutes); // /api/booking/...



router.use("/traveller", travellerRoutes)
export default router;
