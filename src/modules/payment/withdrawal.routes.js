import express from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import {
  checkKYCCompleteService,
  requestWithdrawalService,
  processWithdrawalService,
  getWithdrawalHistoryService,
  getWithdrawalDetailsService,
} from "./withdrawal.service.js";
import {
  creditWalletService,
  debitWalletService,
  getWalletBalanceService,
  getWalletDetailsService,
  getWalletTransactionsService,
} from "./wallet.service.js";

const router = express.Router();

// ─── Get Wallet Balance ───────────────────────────────────────────────────
router.get("/wallet/balance", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const balance = await getWalletBalanceService(userId);

    res.status(200).json({
      success: true,
      balance: balance.balance,
      wallet_id: balance.wallet_id,
    });
  } catch (error) {
    console.error("❌ Error getting wallet balance:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch wallet balance",
      error: error.message,
    });
  }
});

// ─── Get Wallet Details ──────────────────────────────────────────────────
router.get("/wallet/details", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const details = await getWalletDetailsService(userId);

    res.status(200).json({
      success: true,
      data: details,
    });
  } catch (error) {
    console.error("❌ Error getting wallet details:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch wallet details",
      error: error.message,
    });
  }
});

// ─── Get Wallet Transactions ─────────────────────────────────────────────
router.get("/wallet/transactions", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const result = await getWalletTransactionsService(userId, limit, offset);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Error getting wallet transactions:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch wallet transactions",
      error: error.message,
    });
  }
});

// ─── Check KYC and Bank Verification Status ───────────────────────────────
router.get("/kyc/bank-status", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const kycStatus = await checkKYCCompleteService(userId);

    res.status(200).json({
      success: true,
      data: kycStatus,
    });
  } catch (error) {
    console.error("❌ Error checking KYC status:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to check KYC status",
      error: error.message,
    });
  }
});

// ─── TESTING ONLY: Bypass KYC for Development ────────────────────────────
router.post("/kyc/bypass", authMiddleware, async (req, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({
        success: false,
        message: "KYC bypass not available in production",
      });
    }

    const userId = req.user.id;
    const TravellerKYC = (await import("../traveller/travellerKYC.model.js")).default;

    // Find existing KYC or create new one
    let kyc = await TravellerKYC.findOne({
      where: { user_id: userId },
    });

    if (!kyc) {
      kyc = await TravellerKYC.create({
        user_id: userId,
        status: "APPROVED",
        bank_verified: true,
        account_number: "TEST-BYPASS-" + userId.slice(0, 8),
        bank_name: "Test Bank",
        ifsc: "TEST0001",
      });
    } else {
      // Update existing KYC
      await kyc.update({
        status: "APPROVED",
        bank_verified: true,
        account_number: kyc.account_number || "TEST-BYPASS-" + userId.slice(0, 8),
        bank_name: kyc.bank_name || "Test Bank",
        ifsc: kyc.ifsc || "TEST0001",
      });
    }

    res.status(200).json({
      success: true,
      message: "✅ KYC bypassed for testing. Status set to APPROVED.",
      data: {
        kycId: kyc.id,
        status: kyc.status,
        bank_verified: kyc.bank_verified,
      },
    });
  } catch (error) {
    console.error("❌ Error in KYC bypass:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to bypass KYC",
      error: error.message,
    });
  }
});

// ─── Request Withdrawal ───────────────────────────────────────────────────
router.post("/withdrawal/request", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount. Please provide a positive number.",
      });
    }

    // Step 1: Create withdrawal request
    const withdrawalRequest = await requestWithdrawalService(userId, amount);
    console.log("✅ Step 1: Withdrawal request created:", withdrawalRequest.withdrawal_id);

    // Step 2: Automatically process the withdrawal
    try {
      const processedResult = await processWithdrawalService(withdrawalRequest.withdrawal_id);
      console.log("✅ Step 2: Withdrawal processed:", processedResult.withdrawal_id);

      res.status(201).json({
        success: true,
        message: "Withdrawal processed successfully",
        data: {
          withdrawal_id: processedResult.withdrawal_id,
          amount: processedResult.amount,
          status: processedResult.status,
          transaction_id: processedResult.transaction_id,
          bank_details: withdrawalRequest.bank_details,
          processed_at: processedResult.processed_at,
        },
      });
    } catch (processError) {
      console.error("⚠️ Failed to auto-process withdrawal:", processError.message);
      // Still return the withdrawal request, but notify user that processing needs approval
      res.status(201).json({
        success: true,
        message: "Withdrawal request created. Processing pending approval.",
        data: withdrawalRequest,
      });
    }
  } catch (error) {
    console.error("❌ Error requesting withdrawal:", error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// ─── Get Withdrawal History ──────────────────────────────────────────────
router.get("/withdrawal/history", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const result = await getWithdrawalHistoryService(userId, limit, offset);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Error getting withdrawal history:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch withdrawal history",
      error: error.message,
    });
  }
});

// ─── Get Withdrawal Details ──────────────────────────────────────────────
router.get("/withdrawal/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await getWithdrawalDetailsService(id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Error getting withdrawal details:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ─── Process Withdrawal (Admin/System) ────────────────────────────────────
// This would typically be called by a scheduled job, but kept here for testing
router.post("/withdrawal/:id/process", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    // TODO: Add admin check here
    const result = await processWithdrawalService(id);

    res.status(200).json({
      success: true,
      message: "Withdrawal processed successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Error processing withdrawal:", error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
