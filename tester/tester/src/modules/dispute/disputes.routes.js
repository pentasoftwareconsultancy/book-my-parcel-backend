import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { generalLimiter } from "../../middlewares/rateLimit.middleware.js";
import { createDispute, getMyDisputes } from "./disputes.controller.js";

const router = express.Router();

router.use(generalLimiter);

// POST /api/dispute        — raise a dispute (user or traveller)
router.post("/", authMiddleware, createDispute);

// GET  /api/dispute/my     — get all disputes raised by the logged-in user
router.get("/my", authMiddleware, getMyDisputes);

export default router;
