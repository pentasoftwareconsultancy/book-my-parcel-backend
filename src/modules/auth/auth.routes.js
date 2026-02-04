import express from "express";
import {
  signupController,
  loginController,
  becomeTravellerController,
} from "./auth.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Public routes
router.post("/signup", signupController);
router.post("/login", loginController);

// Protected route
router.post("/become-traveller", authMiddleware, becomeTravellerController);

export default router;
