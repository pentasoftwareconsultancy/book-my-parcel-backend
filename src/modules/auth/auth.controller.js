// controllers/auth.controller.js
import * as authService from "./auth.service.js";

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
