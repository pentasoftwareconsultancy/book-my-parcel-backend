import sequelize from "../../config/database.config.js";
import Wallet from "./wallet.model.js";
import WalletTransaction from "./walletTransaction.model.js";
import User from "../user/user.model.js";

// ─── Create or Get Wallet for User ─────────────────────────────────────────
async function getOrCreateWallet(userId) {
  try {
    let wallet = await Wallet.findOne({ where: { user_id: userId } });
    
    if (!wallet) {
      wallet = await Wallet.create({ user_id: userId, balance: 0 });
      console.log(`✅ [Wallet] Created new wallet for user: ${userId}`);
    }
    
    return wallet;
  } catch (error) {
    console.error("❌ [Wallet] Error in getOrCreateWallet:", error.message);
    throw error;
  }
}

// ─── Credit Wallet (Add Money) ────────────────────────────────────────────
export async function creditWalletService(userId, amount, reason, externalTransaction = null) {
  const t = externalTransaction || await sequelize.transaction();
  const shouldCommit = !externalTransaction; // Only commit if we created the transaction
  
  try {
    // Get or create wallet
    const wallet = await getOrCreateWallet(userId);
    
    // Update wallet balance
    const newBalance = parseFloat(wallet.balance) + parseFloat(amount);
    
    await wallet.update(
      { balance: newBalance },
      { transaction: t }
    );
    
    // Record transaction
    const transaction = await WalletTransaction.create(
      {
        wallet_id: wallet.id,
        type: "CREDIT",
        amount: parseFloat(amount),
        reason: reason || "Wallet credit",
      },
      { transaction: t }
    );
    
    if (shouldCommit) {
      await t.commit();
    }
    
    console.log(
      `✅ [Wallet] Credited ₹${amount} to user ${userId}. Reason: ${reason}`
    );
    console.log(`   New balance: ₹${newBalance}`);
    
    return {
      wallet,
      transaction,
      newBalance,
    };
  } catch (error) {
    await t.rollback();
    console.error("❌ [Wallet] Error in creditWalletService:", error.message);
    throw error;
  }
}

// ─── Debit Wallet (Remove Money) ──────────────────────────────────────────
export async function debitWalletService(userId, amount, reason, externalTransaction = null) {
  const t = externalTransaction || await sequelize.transaction();
  const shouldCommit = !externalTransaction; // Only commit if we created the transaction
  
  try {
    const wallet = await getOrCreateWallet(userId);
    
    const currentBalance = parseFloat(wallet.balance);
    const debitAmount = parseFloat(amount);
    
    // Check if sufficient balance
    if (currentBalance < debitAmount) {
      throw new Error(
        `Insufficient balance. Available: ₹${currentBalance}, Requested: ₹${debitAmount}`
      );
    }
    
    // Update wallet balance
    const newBalance = currentBalance - debitAmount;
    
    await wallet.update(
      { balance: newBalance },
      { transaction: t }
    );
    
    // Record transaction
    const transaction = await WalletTransaction.create(
      {
        wallet_id: wallet.id,
        type: "DEBIT",
        amount: debitAmount,
        reason: reason || "Wallet debit",
      },
      { transaction: t }
    );
    
    if (shouldCommit) {
      await t.commit();
    }
    
    console.log(
      `✅ [Wallet] Debited ₹${amount} from user ${userId}. Reason: ${reason}`
    );
    console.log(`   New balance: ₹${newBalance}`);
    
    return {
      wallet,
      transaction,
      newBalance,
    };
  } catch (error) {
    if (shouldCommit) {
      await t.rollback();
    }
    console.error("❌ [Wallet] Error in debitWalletService:", error.message);
    throw error;
  }
}

// ─── Get Wallet Balance ───────────────────────────────────────────────────
export async function getWalletBalanceService(userId) {
  try {
    const wallet = await getOrCreateWallet(userId);
    
    return {
      balance: parseFloat(wallet.balance),
      wallet_id: wallet.id,
    };
  } catch (error) {
    console.error("❌ [Wallet] Error in getWalletBalanceService:", error.message);
    throw error;
  }
}

// ─── Get Wallet Transactions ──────────────────────────────────────────────
export async function getWalletTransactionsService(userId, limit = 50, offset = 0) {
  try {
    const wallet = await getOrCreateWallet(userId);
    
    const transactions = await WalletTransaction.findAndCountAll({
      where: { wallet_id: wallet.id },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });
    
    return {
      transactions: transactions.rows,
      total: transactions.count,
      pagination: {
        limit,
        offset,
        totalPages: Math.ceil(transactions.count / limit),
      },
    };
  } catch (error) {
    console.error(
      "❌ [Wallet] Error in getWalletTransactionsService:",
      error.message
    );
    throw error;
  }
}

// ─── Get Wallet Details with Balance ──────────────────────────────────────
export async function getWalletDetailsService(userId) {
  try {
    const wallet = await getOrCreateWallet(userId);
    
    const transactionCount = await WalletTransaction.count({
      where: { wallet_id: wallet.id },
    });
    
    return {
      wallet_id: wallet.id,
      user_id: wallet.user_id,
      balance: parseFloat(wallet.balance),
      total_transactions: transactionCount,
      created_at: wallet.createdAt,
      updated_at: wallet.updatedAt,
    };
  } catch (error) {
    console.error(
      "❌ [Wallet] Error in getWalletDetailsService:",
      error.message
    );
    throw error;
  }
}

export default {
  creditWalletService,
  debitWalletService,
  getWalletBalanceService,
  getWalletTransactionsService,
  getWalletDetailsService,
};
