import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { generalLimiter } from "../../middlewares/rateLimit.middleware.js";
import { createDispute, getMyDisputes, getDisputesAgainstMe, getUserDisputesAgainstMe } from "./disputes.controller.js";

const router = express.Router();

router.use(generalLimiter);

// POST /api/dispute           — raise a dispute (user or traveller)
router.post("/", authMiddleware, createDispute);

// GET  /api/dispute/my        — get all disputes raised by the logged-in user
router.get("/my", authMiddleware, getMyDisputes);

// GET  /api/dispute/against-me — get all disputes raised AGAINST the logged-in traveller (by users)
router.get("/against-me", authMiddleware, getDisputesAgainstMe);

// GET  /api/dispute/user-against-me — get all disputes raised AGAINST the logged-in user (by travellers)
router.get("/user-against-me", authMiddleware, getUserDisputesAgainstMe);

export default router;
