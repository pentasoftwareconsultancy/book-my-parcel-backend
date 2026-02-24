import express from "express";
import multer from "multer";
import fs from "fs";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import * as ctrl from "./traveller.controller.js";
import { validateKYC, validateStatus, validateRoute } from "../../utils/validation.util.js";



const router = express.Router();

const uploadDir = "uploads/kyc";

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({ storage });

router.post(
  "/kyc",
  authMiddleware,
  upload.fields([
    { name: "aadharFront", maxCount: 1 },
    { name: "aadharBack", maxCount: 1 },
    { name: "panFront", maxCount: 1 },
    { name: "panBack", maxCount: 1 },
    { name: "drivingPhoto", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
  ]),
  validateKYC,
  ctrl.submitKYC
);

router.get("/kyc", authMiddleware, ctrl.getMyKYC);

// update 

router.patch(
  "/kyc/status/:id",
  authMiddleware,
  validateStatus, 
  ctrl.updateKYCStatus
);

// Get nearby travelers
router.get("/nearby", ctrl.getNearbyTravelers);



// Add routes for traveller routes and profiles as needed

// Route management
router.post("/routes", authMiddleware, validateRoute, ctrl.createRoute);
router.get("/routes", authMiddleware, ctrl.getMyRoutes);
router.get("/routes/:id", authMiddleware, ctrl.getRouteById);
router.put("/routes/:id", authMiddleware, validateRoute, ctrl.updateRoute);
router.delete("/routes/:id", authMiddleware, ctrl.deleteRoute);

export default router;