/**
 * Payment Release Job
 *
 * Handles deferred wallet crediting for delivered bookings.
 *
 * Current flow: wallet is credited immediately on delivery OTP verification
 * (inside booking.service.js → verifyDelivery).
 *
 * This job acts as a safety net to catch any bookings that reached DELIVERED
 * status but whose wallet credit failed (e.g. due to a transient DB error).
 * It also provides a hook for adding a dispute hold window in the future.
 *
 * Logic:
 * 1. Find DELIVERED bookings where payment was NOT yet released
 *    (Payment.released_at IS NULL AND Payment.status = SUCCESS)
 * 2. Credit the traveller wallet for each
 * 3. Mark Payment.released_at = now
 */

import { Op } from "sequelize";
import sequelize from "../config/database.config.js";
import Payment from "../modules/payment/payment.model.js";
import Booking from "../modules/booking/booking.model.js";
import Parcel from "../modules/parcel/parcel.model.js";
import { creditWalletService } from "../modules/payment/wallet.service.js";
import { PAYMENT_STATUS } from "../utils/constants.js";
import { getOrCache } from "../utils/cache.util.js";

/**
 * Release pending payments for delivered bookings.
 * Safe to run multiple times — idempotent via released_at check.
 * @returns {number} count of payments released
 */
export async function releaseDeliveredPayments() {
  // Find successful payments that haven't been released yet
  const unreleased = await Payment.findAll({
    where: {
      status: PAYMENT_STATUS.SUCCESS,
      released_at: null,
    },
    include: [
      {
        model: Booking,
        required: true,
        where: { status: "DELIVERED" },
        include: [
          {
            model: Parcel,
            as: "parcel",
            attributes: ["id", "price_quote"],
          },
        ],
      },
    ],
  });

  if (unreleased.length === 0) {
    return 0;
  }

  console.log(
    `[PaymentRelease] Found ${unreleased.length} unreleased payment(s) for delivered bookings`
  );

  let releasedCount = 0;

  for (const payment of unreleased) {
    // Sequelize uses the model's tableName as the association key (lowercase 'booking')
    const booking = payment.booking ?? payment.Booking;
    const travellerId = booking?.traveller_id;
    const fullAmount = Number(booking?.parcel?.price_quote || payment.amount || 0);

    if (!travellerId || !fullAmount) {
      console.warn(
        `[PaymentRelease] Skipping payment ${payment.id} — traveller_id: ${travellerId}, amount: ${fullAmount}`
      );
      continue;
    }

    // Calculate platform fee and partner amount
    const platformFeePercent = await getOrCache(
      "platform_settings:platform_fee_percent",
      async () => {
        const feeResult = await sequelize.query(
          `SELECT value FROM platform_settings WHERE key = 'platform_fee_percent'`,
          { type: sequelize.QueryTypes.SELECT }
        );
        return parseFloat(feeResult[0]?.value || 10);
      },
      300 // 5 min TTL
    );
    const platformFee = Math.round(fullAmount * (platformFeePercent / 100));
    const partnerAmount = fullAmount - platformFee;

    const t = await sequelize.transaction();
    try {
      // Credit wallet with partner amount (after platform fee deduction)
      await creditWalletService(
        travellerId,
        partnerAmount,  // ← Changed from fullAmount
        `Delivery payment for booking ${booking.booking_ref || booking.id} (Platform fee: ₹${platformFee})`,
        t
      );

      // Mark payment as released
      await payment.update(
        { released_at: new Date() },
        { transaction: t }
      );

      await t.commit();

      console.log(
        `[PaymentRelease] ✅ Released ₹${partnerAmount} to traveller ${travellerId} for booking ${booking.id} (Full: ₹${fullAmount}, Platform fee: ₹${platformFee})`
      );
      releasedCount++;
    } catch (err) {
      await t.rollback();
      console.error(
        `[PaymentRelease] ❌ Failed to release payment ${payment.id}:`,
        err.message
      );
      // Continue to next payment — don't abort the whole job
    }
  }

  return releasedCount;
}

/**
 * Run the full payment release cycle.
 * Call this from server.js on a setInterval or cron.
 */
export async function runPaymentReleaseJob() {
  try {
    console.log("[PaymentRelease] Running payment release job...");
    const released = await releaseDeliveredPayments();
    console.log(`[PaymentRelease] Done — released: ${released} payment(s)`);
  } catch (err) {
    console.error("[PaymentRelease] Job failed:", err.message);
  }
}

export default runPaymentReleaseJob;
