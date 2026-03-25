import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import parcelRoutes from "./modules/parcel/parcel.routes.js"
import userRoutes from "./modules/user/user.routes.js";
import travellerRoutes from "./modules/traveller/traveller.routes.js";
import travellerRouteRoutes from "./modules/traveller/travellerRoute.routes.js";
import placesRoutes from "./modules/places/places.routes.js";
import matchingRoutes from "./modules/matching/matching.routes.js";
import bookingRoutes from "./modules/booking/booking.routes.js";

const router = express.Router();

// Module routes
router.use("/auth", authRoutes); // /api/auth/...
router.use("/user", userRoutes); // /api/user/...
router.use("/places", placesRoutes); // /api/places/autocomplete

// Booking routes (OTP verification for pickup/delivery)
router.use("/booking", bookingRoutes); // /api/booking/:id/start-pickup, verify-pickup, start-delivery, verify-delivery

// Parcel routes (includes matching endpoints for parcel owners)
router.use("/parcel", parcelRoutes); // /api/parcel/...
router.use("/parcel", matchingRoutes); // /api/parcel/:id/find-travellers, /api/parcel/:id/acceptances, /api/parcel/:id/select-traveller, /api/parcel/:id/route-geometry

// Traveller routes (includes matching endpoints for travellers)
router.use("/traveller", travellerRoutes); // /api/traveller/...
router.use("/traveller/routes", travellerRouteRoutes); // /api/traveller/routes/...
router.use("/traveller", matchingRoutes); // /api/traveller/requests, /api/traveller/requests/:requestId/accept, /api/traveller/requests/:requestId/express-interest, /api/traveller/requests/:requestId/reject

// Matching admin/testing routes
router.use("/matching", matchingRoutes); // /api/matching/run-periodic, /api/matching/test-parcel/:id, /api/matching/test-traveller-requests/:travellerId

// Admin routes
router.use("/admin", adminRoutes); // /api/admin/...

export default router;
