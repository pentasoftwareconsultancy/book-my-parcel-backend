import express from "express";
import { createParcel, getParcelById, getUserRequests, updateParcelStep, cancelParcel } from "./parcel.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { generalLimiter, parcelCreationLimiter } from "../../middlewares/rateLimit.middleware.js";
import { upload } from "../../utils/fileUpload.util.js";
import {
  validateRequest,
  parseJsonFields,
  parcelRequestSchema,
} from "../../middlewares/validation.middleware.js";

const router = express.Router();

// Route: Create Parcel Request (Sender) - Use lenient limiter
router.post(
  "/request",
  authMiddleware,
  parcelCreationLimiter, // More lenient rate limit for parcel creation
  upload.array("parcel_photos", 3),         // multer must run before validation
  parseJsonFields("pickup_address", "delivery_address"), // parse JSON strings from multipart
  validateRequest(parcelRequestSchema),
  createParcel
);

// Apply general rate limiting to other parcel routes
router.use(generalLimiter);

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

// Route: Cancel parcel (User cancels their own parcel)
router.post(
  "/:id/cancel",
  authMiddleware,
  generalLimiter,
  cancelParcel
);

export default router;
