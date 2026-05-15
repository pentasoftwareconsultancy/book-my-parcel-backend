import { signup, login, logout } from "./auth.service.js";
import { responseError, responseSuccess } from "../../utils/response.util.js";
import * as authService from "./auth.service.js";
/**
 * ─────────────────────────────
 * SIGNUP CONTROLLER
 * ─────────────────────────────
 */
export async function signupController(req, res) {
  try {
    const result = await signup(req.body);
    return responseSuccess(res, result, "Signup successful", 201);
  } catch (err) {
    return responseError(res, err.message, 400);
  }
}

/**
 * ─────────────────────────────
 * LOGIN CONTROLLER
 * ─────────────────────────────
 */
export async function loginController(req, res) {
  try {
    const { email, password, role } = req.body;

    // Check all fields present
    if (!email || !password || !role) {
      return responseError(res, "Email, password and role are required", 400);
    }

    const result = await login(email, password, role);
    return responseSuccess(res, result, "Login successful", 200);

  } catch (err) {
    return responseError(res, err.message, 400);
  }
}

/*
UPDATE PROFILE CONTROLLER
*/

export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await authService.updateProfile(userId, req.body);
    return responseSuccess(res, result, "Profile updated successfully");
  } catch (error) {
    return responseError(res, error.message, 400);
  }
};

/*
GET USER PROFILE
 */

export const getProfileController= async (req, res) => {
  try {
    const data = await authService.getUserProfile(req.user.id);
    return responseSuccess(res, data, "Profile fetched successfully");
  } catch (error) {
    return responseError(res, error.message, 500);
  }
};

/**
 * UPLOAD PROFILE PHOTO CONTROLLER
 */
export async function uploadProfilePhotoController(req, res) {
  try {
    const userId = req.user.id;
    const file = req.file;

    const result = await authService.uploadProfilePhoto(userId, file);
    
    return responseSuccess(res, result, "Profile photo uploaded successfully");
  } catch (err) {
    console.error("Upload profile photo error:", err.message);
    return responseError(res, err.message, 400);
  }
}

/**
 * FORGOT PASSWORD — single endpoint
 * Step 1: { email }                        → sends OTP
 * Step 2: { email, otp, newPassword }      → verifies OTP and resets password
 */
export async function forgotPasswordController(req, res) {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email) return responseError(res, "Email is required", 400);

    // Step 2 — all three fields present
    if (otp && newPassword) {
      const result = await authService.resetPasswordWithOtp(email, otp, newPassword);
      return responseSuccess(res, {}, result.message);
    }

    // Step 1 — only email
    const result = await authService.requestPasswordResetOtp(email);
    return responseSuccess(res, result, result.message);
  } catch (err) {
    console.error("[ForgotPassword] Error:", err.message);
    return responseError(res, err.message, 400);
  }
}

/**
 * UPDATE PASSWORD CONTROLLER
 */
export async function updatePasswordController(req, res) {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return responseError(res, "Old password and new password are required", 400);
    }

    const result = await authService.updatePassword(userId, oldPassword, newPassword);
    
    return responseSuccess(res, {}, result.message);
  } catch (err) {
    console.error("Update password error:", err.message);
    return responseError(res, err.message, 400);
  }
}
/**
 * ─────────────────────────────
 * LOGOUT CONTROLLER
 * ─────────────────────────────
 */
export async function logoutController(req, res) {
  try {
    const token = req.token; // From auth middleware
    const userId = req.user.id;

    if (!token) {
      return responseError(res, "No token found", 400);
    }

    const result = await logout(token, userId);
    return responseSuccess(res, result, result.message, 200);

  } catch (err) {
    console.error("Logout controller error:", err);
    return responseError(res, err.message || "Logout failed", 500);
  }
}