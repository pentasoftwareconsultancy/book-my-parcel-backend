


import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireAdmin } from "../../middlewares/role.middleware.js";
import { generalLimiter } from "../../middlewares/rateLimit.middleware.js";
import * as ctrl from "./traveller.controller.js";
import { validateKYC, validateStatus, validateRoute } from "../../utils/validation.util.js";

const router = express.Router();

// Apply rate limiting to all traveller routes
router.use(generalLimiter);

// ── Multer Setup ─────────────────────────────
const uploadDir = "uploads/kyc";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
      return cb(null, true);
    }
    cb(new Error("Only image or PDF files are allowed for KYC."));
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
});

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
router.get("/kyc/all",       authMiddleware, requireAdmin, ctrl.getAllKYCs);
router.patch("/kyc/status/:id", authMiddleware, requireAdmin, validateStatus, ctrl.updateKYCStatus);

// ── Dashboard ────────────────────────────────  ✅ added
router.get("/dashboard/deliveries", authMiddleware, ctrl.getTravelerDeliveries);
router.get("/dashboard/stats",      authMiddleware, ctrl.getTravelerStats);
router.get("/dashboard/requests",   authMiddleware, ctrl.getTravelerParcelRequests);
router.get("/dashboard/pending-payments", authMiddleware, ctrl.getPendingPayments);
router.get("/dashboard/bookings/:bookingId", authMiddleware, ctrl.getTravelerBookingDetails);

// ── Delivery Status & OTP Management ────────  ✅ NEW
router.patch("/booking/:bookingId/status", authMiddleware, ctrl.updateBookingStatus);
router.post("/booking/:bookingId/otp/generate", authMiddleware, ctrl.generateOTP);
router.post("/booking/:bookingId/otp/verify", authMiddleware, ctrl.verifyOTP);

export default router;
