// controllers/auth.controller.js
import * as authService from "./auth.service.js";
import User from "../user/user.model.js";

/**
 * SIGNUP CONTROLLER
 */
export async function signupController(req, res) {
  try {
    console.log("Signup req.body:", req.body);

    const { role, selectedRole, ...userData } = req.body;
    const finalRole = role || selectedRole;

    const result = await authService.signup(userData, finalRole);
    res.status(201).json(result);
  } catch (err) {
    console.error("Signup error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// update

export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;; // must match token payload
    const result = await authService.updateProfile(userId, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


/**
 * LOGIN CONTROLLER
 */
export async function loginController(req, res) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/**
 * BECOME TRAVELLER CONTROLLER
 */
export async function becomeTravellerController(req, res) {
  try {
    const userId = req.user.id;
    const result = await authService.becomeTraveller(userId);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/**
 * REQUEST OTP CONTROLLER
 */
export async function requestOTPController(req, res) {
  try {
    const { phone } = req.body;
    
    // In development, we'll generate a simple 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP temporarily (in production, use Redis)
    // For now, we'll just return it in response for development
    console.log(`OTP for ${phone}: ${otp}`);
    
    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      otp: process.env.NODE_ENV === 'development' ? otp : undefined // Only expose in dev
    });
  } catch (err) {
    console.error("OTP request error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

/**
 * VERIFY OTP CONTROLLER
 */
export async function verifyOTPController(req, res) {
  try {
    const { phone, otp, role } = req.body;
    
    // In development, we'll just verify the format
    if (!phone || !otp || !role) {
      throw new Error("Phone, OTP, and role are required");
    }
    
    // Validate OTP format (6 digits)
    if (!/^\d{6}$/.test(otp)) {
      throw new Error("Invalid OTP format");
    }
    
    // In production, you would check against stored OTP
    // For development, we'll accept any 6-digit OTP
    console.log(`OTP verified for ${phone}: ${otp}`);
    
    // Find user by phone
    const user = await User.findOne({ where: { phone_number: phone } });
    if (!user) {
      throw new Error("User not found");
    }
    
    // Generate token
    const token = authService.generateToken({ id: user.id });
    
    res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number
      }
    });
  } catch (err) {
    console.error("OTP verification error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

/**
 * CHECK USER EXISTS CONTROLLER
 */
export async function checkUserExistsController(req, res) {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      throw new Error("Phone number is required");
    }
    
    const user = await User.findOne({ where: { phone_number: phone } });
    
    res.status(200).json({
      exists: !!user,
      message: user ? "User exists" : "User not found"
    });
  } catch (err) {
    console.error("Check user exists error:", err.message);
    res.status(400).json({ error: err.message });
  }
}