import express from "express";
import {
  signupController,
  loginController,
  updateUserProfile,
  getProfileController,
  uploadProfilePhotoController,
  updatePasswordController,
  forgotPasswordController,
  logoutController,
} from "./auth.controller.js";

import { uploadProfile } from "../../utils/fileUpload.util.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { loginLimiter, signupLimiter, sensitiveLimiter, profileLimiter, otpGenerationLimiter } from "../../middlewares/rateLimit.middleware.js";

const router = express.Router();

// Public routes with rate limiting
router.post("/signup", signupLimiter, signupController);
router.post("/login", loginLimiter, loginController);

// Forgot password (public — single endpoint handles both steps)
router.post("/forgot-password", otpGenerationLimiter, forgotPasswordController);

// Protected routes
router.get("/profile", authMiddleware, getProfileController);
router.put("/update-profile", authMiddleware, profileLimiter, updateUserProfile);

// Sensitive routes with stricter rate limiting
router.post("/profile/photo", authMiddleware, sensitiveLimiter, uploadProfile.single("photo"), uploadProfilePhotoController);
router.put("/profile/photo", authMiddleware, sensitiveLimiter, uploadProfile.single("photo"), uploadProfilePhotoController);
router.put("/update-password", authMiddleware, profileLimiter, sensitiveLimiter, updatePasswordController);

// Logout (protected)
router.post("/logout", authMiddleware, logoutController);

export default router;