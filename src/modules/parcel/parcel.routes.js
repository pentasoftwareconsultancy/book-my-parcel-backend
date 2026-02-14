import express from "express";
import { createParcel, getParcelById } from "./parcel.controller.js";
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

// Route: Get single parcel by ID
router.get(
  "/:id",
  authMiddleware,
  getParcelById
);

export default router;
