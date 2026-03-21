


import express from "express";
import multer from "multer";
import fs from "fs";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import * as ctrl from "./traveller.controller.js";
import { validateKYC, validateStatus, validateRoute } from "../../utils/validation.util.js";
// import * as trip from "./travellerTrip.controller.js";

const router = express.Router();

// ── Multer Setup ─────────────────────────────
const uploadDir = "uploads/kyc";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({ storage });

const kycUpload = upload.fields([
  { name: "aadharFront",  maxCount: 1 },
  { name: "aadharBack",   maxCount: 1 },
  { name: "panFront",     maxCount: 1 },
  { name: "panBack",      maxCount: 1 },
  { name: "drivingPhoto", maxCount: 1 },
  { name: "selfie",       maxCount: 1 },
]);

// ── KYC ──────────────────────────────────────
router.post("/kyc",          authMiddleware, kycUpload, validateKYC, ctrl.submitKYC);
router.get("/kyc",           authMiddleware, ctrl.getMyKYC);
router.get("/kyc/all",       authMiddleware, ctrl.getAllKYCs);          // admin
router.patch("/kyc/status/:id", authMiddleware, validateStatus, ctrl.updateKYCStatus); // admin
// router.put("/kyc/update",    authMiddleware, kycUpload, validateKYC, ctrl.updateTravellerKYC);

// ── Nearby Travelers ─────────────────────────
// router.get("/nearby", ctrl.getNearbyTravelers);

// ── Dashboard ────────────────────────────────  ✅ added
router.get("/dashboard/deliveries", authMiddleware, ctrl.getTravelerDeliveries);
router.get("/dashboard/stats",      authMiddleware, ctrl.getTravelerStats);

// ── Routes ───────────────────────────────────
router.post("/routes",     authMiddleware, validateRoute, ctrl.createRoute);
router.get("/routes",      authMiddleware, ctrl.getMyRoutes);
router.get("/routes/:id",  authMiddleware, ctrl.getRouteById);
router.put("/routes/:id",  authMiddleware, validateRoute, ctrl.updateRoute);
router.delete("/routes/:id", authMiddleware, ctrl.deleteRoute);

// ── Trips ─────────────────────────────────────
// router.post("/trip",     authMiddleware, trip.createTravellerTrip);  
// router.get("/trip",      authMiddleware, trip.getAllTravellerTrips); 
// router.get("/trip/:id",  authMiddleware, trip.getTravellerTripById); 

export default router;
