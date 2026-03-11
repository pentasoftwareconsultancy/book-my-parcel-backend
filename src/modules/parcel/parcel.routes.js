import express from "express";
import { createParcel, getParcelById,getUserRequests } from "./parcel.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { upload } from "../../utils/fileUpload.util.js";

const router = express.Router();

// Route: Create Parcel Request (Sender)
router.post(
  "/request",
  authMiddleware,
  upload.array("parcel_photos", 3), // max 3 photos
  createParcel
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
