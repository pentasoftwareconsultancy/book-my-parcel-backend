import { signup, login } from "./auth.service.js";
import { responseError, responseSuccess } from "../../utils/response.util.js";

/**
 * ─────────────────────────────
 * SIGNUP CONTROLLER
 * POST /api/auth/signup
 * ─────────────────────────────
 * Body: {
 *   full_name, email, password,
 *   phone_number, alternate_phone (optional),
 *   address, city, state (optional)
 * }
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
 * POST /api/auth/login
 * ─────────────────────────────
 * Body: {
 *   email, password,
 *   role: "INDIVIDUAL" | "TRAVELLER"
 * }
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