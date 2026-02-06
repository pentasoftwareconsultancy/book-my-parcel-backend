import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";

const router = express.Router();

// Module routes
router.use("/auth", authRoutes); // /api/auth/...
export default router;
