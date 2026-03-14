import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";
// import bookingRoutes from "./modules/booking/booking.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import parcelRoutes from "./modules/parcel/parcel.routes.js"
import userRoutes from "./modules/user/user.routes.js";
import travellerRoutes from "./modules/traveller/traveller.routes.js";
import travellerRouteRoutes from "./modules/traveller/travellerRoute.routes.js";
import placesRoutes from "./modules/places/places.routes.js";

const router = express.Router();

// Module routes
router.use("/auth", authRoutes); // /api/auth/...
// router.use("/booking", bookingRoutes); // /api/booking/
router.use("/parcel", parcelRoutes); // /api/parcel/
router.use("/places", placesRoutes); // /api/places/autocomplete
router.use("/user", userRoutes); // /api/user/...

//Travller Routes
router.use("/traveller", travellerRoutes); // /api/traveller/...
router.use("/traveller/routes", travellerRouteRoutes); // /api/traveller/routes

// Admin Routes
router.use("/admin", adminRoutes); // /api/admin/...

export default router;
