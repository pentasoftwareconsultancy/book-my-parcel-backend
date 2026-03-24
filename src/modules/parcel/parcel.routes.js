import express from "express";
import { createParcel, getParcelById, getUserRequests, updateParcelStep } from "./parcel.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { generalLimiter } from "../../middlewares/rateLimit.middleware.js";
import { upload } from "../../utils/fileUpload.util.js";
import {
  validateRequest,
  parseJsonFields,
  parcelRequestSchema,
} from "../../middlewares/validation.middleware.js";

const router = express.Router();

// Apply rate limiting to all parcel routes
router.use(generalLimiter);

// Route: Create Parcel Request (Sender)
router.post(
  "/request",
  authMiddleware,
  upload.array("parcel_photos", 3),         // multer must run before validation
  parseJsonFields("pickup_address", "delivery_address"), // parse JSON strings from multipart
  validateRequest(parcelRequestSchema),
  createParcel
);

// Route: Update parcel form step
router.patch(
  "/:id/step",
  authMiddleware,
  updateParcelStep
);

// Get all parcels of logged-in user
// router.get(
//   "/dashboard/orders",
//   authMiddleware,
//   getUserRequests
// );

// Route: Get single parcel by ID
router.get(
  "/:id",
  authMiddleware,
  getParcelById
);

export default router;
