/**
 * Referral Service
 *
 * Flow:
 * 1. Every user gets a unique referral code on signup (stored in user_profiles)
 * 2. New user enters a referral code during signup
 * 3. A Referral record is created with status PENDING
 * 4. After the referred user completes their FIRST booking (DELIVERED),
 *    both parties are credited via wallet
 */

import { Op } from "sequelize";
import sequelize from "../config/database.config.js";
import Referral from "../modules/user/referral.model.js";
import UserProfile from "../modules/user/userProfile.model.js";
import { creditWalletService } from "../modules/payment/wallet.service.js";
import { createNotification } from "../modules/notification/notification.service.js";
import app from "../app.js";

const REFERRER_CREDIT = 50; // ₹50 for the person who referred
const REFERRED_CREDIT = 30; // ₹30 for the new user (applied as wallet credit)

/**
 * Generate a unique 8-character alphanumeric referral code.
 */
export function generateReferralCode(userId) {
  // Use first 6 chars of UUID + 2 random chars for uniqueness
  const base = userId.replace(/-/g, "").substring(0, 6).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 4).toUpperCase();
  return `BMP${base}${rand}`;
}

/**
 * Assign a referral code to a new user profile.
 * Called during signup.
 */
export async function assignReferralCode(userId, transaction) {
  const code = generateReferralCode(userId);
  await UserProfile.update(
    { referral_code: code },
    { where: { user_id: userId }, transaction }
  );
  return code;
}

/**
 * Process a referral code entered during signup.
 * Creates a PENDING Referral record.
 * @param {string} referredUserId - The new user's ID
 * @param {string} referralCode   - The code they entered
 */
export async function processReferralOnSignup(referredUserId, referralCode) {
  if (!referralCode?.trim()) return null;

  try {
    // Find the referrer by their code
    const referrerProfile = await UserProfile.findOne({
      where: { referral_code: referralCode.trim().toUpperCase() },
    });

    if (!referrerProfile) {
      console.warn(`[Referral] Code not found: ${referralCode}`);
      return null;
    }

    if (referrerProfile.user_id === referredUserId) {
      console.warn(`[Referral] Self-referral attempt by user ${referredUserId}`);
      return null;
    }

    // Check if this user was already referred
    const existing = await Referral.findOne({ where: { referred_id: referredUserId } });
    if (existing) {
      console.warn(`[Referral] User ${referredUserId} already has a referral`);
      return null;
    }

    const referral = await Referral.create({
      referrer_id:     referrerProfile.user_id,
      referred_id:     referredUserId,
      referral_code:   referralCode.trim().toUpperCase(),
      status:          "PENDING",
      referrer_credit: REFERRER_CREDIT,
      referred_credit: REFERRED_CREDIT,
    });

    console.log(`[Referral] Created PENDING referral: ${referrerProfile.user_id} → ${referredUserId}`);
    return referral;
  } catch (err) {
    console.error("[Referral] Error processing referral on signup:", err.message);
    return null; // Non-fatal
  }
}

/**
 * Credit both parties after the referred user completes their first delivery.
 * Called from booking.service.js → verifyDelivery.
 * @param {string} deliveredUserId - The user who just completed a delivery (as sender)
 */
export async function creditReferralOnFirstDelivery(deliveredUserId) {
  try {
    // Find a PENDING referral where this user is the referred party
    const referral = await Referral.findOne({
      where: {
        referred_id: deliveredUserId,
        status: "PENDING",
      },
    });

    if (!referral) return; // No pending referral for this user

    const t = await sequelize.transaction();
    try {
      // Credit referrer
      await creditWalletService(
        referral.referrer_id,
        referral.referrer_credit,
        `Referral bonus — your friend completed their first delivery`,
        t
      );

      // Credit referred user
      await creditWalletService(
        referral.referred_id,
        referral.referred_credit,
        `Welcome bonus — referral reward for your first delivery`,
        t
      );

      // Mark referral as credited
      await referral.update(
        { status: "CREDITED", credited_at: new Date() },
        { transaction: t }
      );

      await t.commit();

      // In-app notifications (best-effort)
      const io = app.get("io");
      await Promise.allSettled([
        createNotification(io, {
          user_id:   referral.referrer_id,
          role:      "user",
          type_code: "referral_credited",
          title:     "Referral Bonus Credited! 🎉",
          message:   `₹${referral.referrer_credit} has been added to your wallet because your friend completed their first delivery.`,
          meta:      { referral_id: referral.id },
        }),
        createNotification(io, {
          user_id:   referral.referred_id,
          role:      "user",
          type_code: "referral_credited",
          title:     "Welcome Bonus Credited! 🎁",
          message:   `₹${referral.referred_credit} has been added to your wallet as a welcome bonus.`,
          meta:      { referral_id: referral.id },
        }),
      ]);

      console.log(`[Referral] ✅ Credited: referrer ₹${referral.referrer_credit}, referred ₹${referral.referred_credit}`);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    console.error("[Referral] Error crediting referral:", err.message);
    // Non-fatal — delivery already succeeded
  }
}

/**
 * Get referral stats for a user.
 */
export async function getReferralStats(userId) {
  const profile = await UserProfile.findOne({
    where: { user_id: userId },
    attributes: ["referral_code"],
  });

  const referrals = await Referral.findAll({
    where: { referrer_id: userId },
    attributes: ["status", "referrer_credit", "credited_at", "createdAt"],
    order: [["createdAt", "DESC"]],
  });

  const totalEarned = referrals
    .filter((r) => r.status === "CREDITED")
    .reduce((sum, r) => sum + parseFloat(r.referrer_credit), 0);

  return {
    referral_code:  profile?.referral_code || null,
    total_referrals: referrals.length,
    credited:        referrals.filter((r) => r.status === "CREDITED").length,
    pending:         referrals.filter((r) => r.status === "PENDING").length,
    total_earned:    totalEarned,
    referrals,
  };
}
