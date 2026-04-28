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
    const booking = payment.Booking; // Sequelize uses model name as key when no alias
    const travellerId = booking?.traveller_id;
    const amount = booking?.parcel?.price_quote || payment.amount;

    if (!travellerId || !amount) {
      console.warn(
        `[PaymentRelease] Skipping payment ${payment.id} — missing traveller_id or amount`
      );
      continue;
    }

    const t = await sequelize.transaction();
    try {
      // Credit wallet
      await creditWalletService(
        travellerId,
        amount,
        `Delivery payment for booking ${booking.booking_ref || booking.id}`,
        t
      );

      // Mark payment as released
      await payment.update(
        { released_at: new Date() },
        { transaction: t }
      );

      await t.commit();

      console.log(
        `[PaymentRelease] ✅ Released ₹${amount} to traveller ${travellerId} for booking ${booking.id}`
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
