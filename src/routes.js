import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";
// import bookingRoutes from "./modules/booking/booking.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import parcelRoutes from "./modules/parcel/parcel.routes.js"
import userRoutes from "./modules/user/user.routes.js";
import travellerRoutes from "./modules/traveller/traveller.routes.js";
import travellerRouteRoutes from "./modules/traveller/travellerRoute.routes.js";
import placesRoutes from "./modules/places/places.routes.js";
import matchingRoutes from "./modules/matching/matching.routes.js";
import ParcelTracking from "./modules/tracking/parcelTracking.routes.js";

const router = express.Router();

// Module routes
router.use("/auth", authRoutes); // /api/auth/...
// router.use("/booking", bookingRoutes); // /api/booking/
router.use("/parcel", parcelRoutes); // /api/parcel/
router.use("/parcel", matchingRoutes); // /api/parcel/:id/find-travellers, /api/parcel/:id/acceptances, etc.
router.use("/places", placesRoutes); // /api/places/autocomplete
router.use("/user", userRoutes); // /api/user/...

router.use("/tracking", ParcelTracking); // /api/tracking/...

//Travller Routes
router.use("/traveller", travellerRoutes); // /api/traveller/...
router.use("/traveller/routes", travellerRouteRoutes); // /api/traveller/routes
router.use("/traveller", matchingRoutes); // /api/traveller/requests, /api/traveller/requests/:requestId/accept

// Matching Routes
router.use("/matching", matchingRoutes); // /api/matching/run-periodic

// Admin Routes
router.use("/admin", adminRoutes); // /api/admin/...

export default router;
