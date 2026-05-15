// kyc.routes.js

import express from "express";
import { verifyPan } from "./pan.controller.js";
import { verifyBankAccount, addBankRecipient } from "./bank.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { sensitiveLimiter } from "../../middlewares/rateLimit.middleware.js";

const router = express.Router();

// PAN Verification
router.post("/pan", authMiddleware, sensitiveLimiter, verifyPan);

// Bank Verification - Step 1: Verify account (sends ₹1)
router.post("/bank/verify", authMiddleware, sensitiveLimiter, verifyBankAccount);

// Bank Verification - Step 2: Add recipient details
router.post("/bank/recipient", authMiddleware, sensitiveLimiter, addBankRecipient);

export default router;
