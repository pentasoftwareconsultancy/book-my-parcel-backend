import { signup, login } from "./auth.service.js";
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
    res.json(result);
  } catch (error) {

    // 🔥 MUST send proper JSON response
    return res.status(400).json({
      message: error.message
    });

  }
};

/*
GET USER PROFILE
 */

export const getProfileController= async (req, res) => {
  try {
    const data = await authService.getUserProfile(req.user.id);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
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
    
    res.status(200).json({
      success: true,
      message: "Profile photo uploaded successfully",
      data: result
    });
  } catch (err) {
    console.error("Upload profile photo error:", err.message);
    res.status(400).json({ error: err.message });
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
      return res.status(400).json({ 
        error: "Old password and new password are required" 
      });
    }

    const result = await authService.updatePassword(userId, oldPassword, newPassword);
    
    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (err) {
    console.error("Update password error:", err.message);
    res.status(400).json({ error: err.message });
  }
}