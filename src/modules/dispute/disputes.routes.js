import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { generalLimiter, sensitiveLimiter } from "../../middlewares/rateLimit.middleware.js";
import { createDispute, getMyDisputes, getDisputesAgainstMe, getUserDisputesAgainstMe } from "./disputes.controller.js";

const router = express.Router();

router.use(generalLimiter);

// POST /api/dispute — raise a dispute (strict limit — prevent spam)
router.post("/", authMiddleware, sensitiveLimiter, createDispute);

// GET  /api/dispute/my
router.get("/my", authMiddleware, getMyDisputes);

// GET  /api/dispute/against-me
router.get("/against-me", authMiddleware, getDisputesAgainstMe);

// GET  /api/dispute/user-against-me
router.get("/user-against-me", authMiddleware, getUserDisputesAgainstMe);

export default router;
