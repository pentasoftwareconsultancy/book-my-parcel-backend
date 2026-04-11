import sequelize from "../../config/database.config.js";
import Withdrawal from "./withdrawal.model.js";
import TravellerKYC from "../traveller/travellerKYC.model.js";
import User from "../user/user.model.js";
import { debitWalletService, getWalletBalanceService } from "./wallet.service.js";

const MINIMUM_WITHDRAWAL = 100; // ₹100 minimum

// ─── Check if KYC is Complete and Bank Verified ────────────────────────────
export async function checkKYCCompleteService(userId) {
  try {
    const kyc = await TravellerKYC.findOne({
      where: { user_id: userId },
      attributes: ["id", "status", "bank_verified", "account_number", "bank_name", "ifsc"],
    });

    if (!kyc) {
      return {
        isComplete: false,
        status: "NOT_STARTED",
        bank_verified: false,
        message: "KYC not started. Complete KYC to enable withdrawals.",
      };
    }

    if (kyc.status !== "APPROVED") {
      return {
        isComplete: false,
        status: kyc.status,
        bank_verified: kyc.bank_verified,
        message: `KYC is ${kyc.status}. Wait for approval or update details.`,
      };
    }

    if (!kyc.bank_verified) {
      return {
        isComplete: false,
        status: kyc.status,
        bank_verified: false,
        message: "Bank details not verified. Update and verify bank account.",
      };
    }

    return {
      isComplete: true,
      status: kyc.status,
      bank_verified: true,
      kycId: kyc.id,
      bankData: {
        account_number: kyc.account_number,
        bank_name: kyc.bank_name,
        ifsc: kyc.ifsc,
      },
      message: "KYC complete. Ready to withdraw.",
    };
  } catch (error) {
    console.error("❌ [Withdrawal] Error in checkKYCCompleteService:", error.message);
    throw error;
  }
}

// ─── Request Withdrawal ──────────────────────────────────────────────────────
export async function requestWithdrawalService(userId, amount) {
  const t = await sequelize.transaction();

  try {
    // Check KYC status
    const kycCheck = await checkKYCCompleteService(userId);
    if (!kycCheck.isComplete) {
      throw new Error(kycCheck.message);
    }

    // Validate amount
    const withdrawAmount = parseFloat(amount);
    if (withdrawAmount < MINIMUM_WITHDRAWAL) {
      throw new Error(
        `Minimum withdrawal amount is ₹${MINIMUM_WITHDRAWAL}. You requested ₹${withdrawAmount}`
      );
    }

    // Check wallet balance
    const balance = await getWalletBalanceService(userId);
    if (balance.balance < withdrawAmount) {
      throw new Error(
        `Insufficient balance. Available: ₹${balance.balance}, Requested: ₹${withdrawAmount}`
      );
    }

    // Get bank details
    const kyc = await TravellerKYC.findOne({
      where: { user_id: userId },
      attributes: ["account_number", "bank_name", "ifsc", "account_holder"],
    });

    // Create withdrawal request
    const withdrawal = await Withdrawal.create(
      {
        user_id: userId,
        amount: withdrawAmount,
        status: "PENDING",
        bank_account_id: kyc.account_number,
        bank_name: kyc.bank_name,
        ifsc_code: kyc.ifsc,
        account_holder: kyc.account_holder,
      },
      { transaction: t }
    );

    await t.commit();

    console.log(
      `✅ [Withdrawal] Request created: ₹${withdrawAmount} from user ${userId}`
    );
    console.log(
      `   Bank: ${kyc.bank_name} | Account: ***${kyc.account_number.slice(-4)}`
    );

    return {
      withdrawal_id: withdrawal.id,
      amount: withdrawAmount,
      status: withdrawal.status,
      requested_at: withdrawal.requested_at,
      bank_details: {
        bank_name: kyc.bank_name,
        account_ending: `***${kyc.account_number.slice(-4)}`,
      },
    };
  } catch (error) {
    await t.rollback();
    console.error("❌ [Withdrawal] Error in requestWithdrawalService:", error.message);
    throw error;
  }
}

// ─── Process Withdrawal (Transfer to Bank) ──────────────────────────────────
export async function processWithdrawalService(withdrawalId) {
  const t = await sequelize.transaction();

  try {
    const withdrawal = await Withdrawal.findByPk(withdrawalId, {
      transaction: t,
    });

    if (!withdrawal) {
      throw new Error(`Withdrawal request not found: ${withdrawalId}`);
    }

    if (withdrawal.status !== "PENDING") {
      throw new Error(
        `Cannot process withdrawal with status: ${withdrawal.status}`
      );
    }

    // Update status to PROCESSING
    await withdrawal.update(
      { status: "PROCESSING" },
      { transaction: t }
    );

    // Debit from wallet with same transaction
    try {
      await debitWalletService(
        withdrawal.user_id,
        withdrawal.amount,
        `Withdrawal to ${withdrawal.bank_name}`,
        t  // Pass the transaction
      );
    } catch (walletError) {
      // Wallet debit failed, revert status
      await withdrawal.update(
        { 
          status: "FAILED",
          failure_reason: walletError.message
        },
        { transaction: t }
      );
      throw walletError;
    }

    // TODO: Integrate with actual bank transfer API (Razorpay, etc.)
    // For now, simulate success
    const transactionId = `TXN_${Date.now()}`;

    // Update withdrawal status to SUCCESS
    await withdrawal.update(
      {
        status: "SUCCESS",
        transaction_id: transactionId,
        processed_at: new Date(),
      },
      { transaction: t }
    );

    await t.commit();

    console.log(
      `✅ [Withdrawal] Processed successfully: ₹${withdrawal.amount}`
    );
    console.log(`   Transaction ID: ${transactionId}`);
    console.log(`   Bank: ${withdrawal.bank_name}`);

    return {
      withdrawal_id: withdrawal.id,
      amount: withdrawal.amount,
      status: withdrawal.status,
      transaction_id: transactionId,
      processed_at: withdrawal.processed_at,
      message: "Withdrawal processed. Money will reach your account in 1-2 business days.",
    };
  } catch (error) {
    await t.rollback();
    console.error("❌ [Withdrawal] Error in processWithdrawalService:", error.message);
    throw error;
  }
}

// ─── Get Withdrawal History ──────────────────────────────────────────────────
export async function getWithdrawalHistoryService(userId, limit = 50, offset = 0) {
  try {
    const withdrawals = await Withdrawal.findAndCountAll({
      where: { user_id: userId },
      attributes: [
        "id",
        "amount",
        "status",
        "bank_name",
        "requested_at",
        "processed_at",
        "transaction_id",
      ],
      order: [["requested_at", "DESC"]],
      limit,
      offset,
    });

    return {
      withdrawals: withdrawals.rows,
      total: withdrawals.count,
      pagination: {
        limit,
        offset,
        totalPages: Math.ceil(withdrawals.count / limit),
      },
    };
  } catch (error) {
    console.error(
      "❌ [Withdrawal] Error in getWithdrawalHistoryService:",
      error.message
    );
    throw error;
  }
}

// ─── Get a Single Withdrawal ─────────────────────────────────────────────────
export async function getWithdrawalDetailsService(withdrawalId) {
  try {
    const withdrawal = await Withdrawal.findByPk(withdrawalId);

    if (!withdrawal) {
      throw new Error(`Withdrawal not found: ${withdrawalId}`);
    }

    return {
      withdrawal_id: withdrawal.id,
      amount: withdrawal.amount,
      status: withdrawal.status,
      bank_details: {
        bank_name: withdrawal.bank_name,
        ifsc: withdrawal.ifsc_code,
        account_holder: withdrawal.account_holder,
        account_ending: `***${withdrawal.bank_account_id.slice(-4)}`,
      },
      dates: {
        requested_at: withdrawal.requested_at,
        processed_at: withdrawal.processed_at,
      },
      transaction_id: withdrawal.transaction_id,
      failure_reason: withdrawal.failure_reason,
    };
  } catch (error) {
    console.error(
      "❌ [Withdrawal] Error in getWithdrawalDetailsService:",
      error.message
    );
    throw error;
  }
}

export default {
  checkKYCCompleteService,
  requestWithdrawalService,
  processWithdrawalService,
  getWithdrawalHistoryService,
  getWithdrawalDetailsService,
};
