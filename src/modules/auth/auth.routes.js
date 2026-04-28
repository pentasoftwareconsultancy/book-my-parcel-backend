import express from "express";
import {
  signupController,
  loginController,
  
  updateUserProfile,
  getProfileController,
  uploadProfilePhotoController,
  updatePasswordController 
} from "./auth.controller.js";

import { uploadProfile } from "../../utils/fileUpload.util.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { loginLimiter, signupLimiter, sensitiveLimiter } from "../../middlewares/rateLimit.middleware.js";

const router = express.Router();

// Public routes with rate limiting
router.post("/signup", signupLimiter, signupController);
router.post("/login", loginLimiter, loginController);

// Protected routes
router.get("/profile", authMiddleware, getProfileController);
router.put("/update-profile", authMiddleware, updateUserProfile);

// Sensitive routes with stricter rate limiting
router.post("/profile/photo", authMiddleware, sensitiveLimiter, uploadProfile.single("photo"), uploadProfilePhotoController);
router.put("/profile/photo", authMiddleware, sensitiveLimiter, uploadProfile.single("photo"), uploadProfilePhotoController);
router.put("/update-password", authMiddleware, sensitiveLimiter, updatePasswordController);

export default router;