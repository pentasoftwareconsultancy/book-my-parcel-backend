import express from "express";
import { createParcel } from "./parcel.controller.js";
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

export default router;
