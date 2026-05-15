/**
 * Migration: Backfill missing payments columns + add UNIQUE on razorpay_order_id
 *
 * Context: The payments table was originally created by sequelize.sync() with
 * only 6 columns (id, booking_id, amount, status, createdAt, updatedAt).
 * The Payment model has since grown to include Razorpay fields, parcel_id,
 * currency, and released_at — none of which exist in the DB yet.
 *
 * This migration:
 *   1. Adds all missing columns (idempotent — uses IF NOT EXISTS)
 *   2. Adds a UNIQUE constraint on razorpay_order_id to prevent duplicate
 *      bookings from concurrent payment webhook/callback races
 *   3. Adds a composite index on (parcel_id, status) for createOrderService
 */

"use strict";

export async function up(queryInterface, Sequelize) {
  const tableDesc = await queryInterface.describeTable("payments");

  // ── 1. Add missing columns (only if they don't already exist) ─────────────

  if (!tableDesc.parcel_id) {
    await queryInterface.addColumn("payments", "parcel_id", {
      type: Sequelize.UUID,
      allowNull: true, // nullable so existing rows don't break
    });
  }

  if (!tableDesc.currency) {
    await queryInterface.addColumn("payments", "currency", {
      type: Sequelize.STRING(10),
      allowNull: true,
      defaultValue: "INR",
    });
  }

  if (!tableDesc.razorpay_order_id) {
    await queryInterface.addColumn("payments", "razorpay_order_id", {
      type: Sequelize.STRING,
      allowNull: true, // existing rows have no order ID
    });
  }

  if (!tableDesc.razorpay_payment_id) {
    await queryInterface.addColumn("payments", "razorpay_payment_id", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  }

  if (!tableDesc.razorpay_signature) {
    await queryInterface.addColumn("payments", "razorpay_signature", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  }

  if (!tableDesc.released_at) {
    await queryInterface.addColumn("payments", "released_at", {
      type: Sequelize.DATE,
      allowNull: true,
      comment: "Set when payment is released to traveller wallet",
    });
  }

  // ── 2. Add UNIQUE constraint on razorpay_order_id ─────────────────────────
  // PostgreSQL UNIQUE constraints allow multiple NULLs, so existing rows
  // with NULL razorpay_order_id are unaffected.
  await queryInterface.addConstraint("payments", {
    fields: ["razorpay_order_id"],
    type: "unique",
    name: "uq_payments_razorpay_order_id",
  });

  // ── 3. Composite index on (parcel_id, status) ─────────────────────────────
  await queryInterface.addIndex("payments", ["parcel_id", "status"], {
    name: "idx_payments_parcel_id_status",
  });
}

export async function down(queryInterface, Sequelize) {
  // Remove index and constraint first
  await queryInterface.removeIndex("payments", "idx_payments_parcel_id_status").catch(() => {});
  await queryInterface.removeConstraint("payments", "uq_payments_razorpay_order_id").catch(() => {});

  // Remove added columns
  for (const col of [
    "released_at",
    "razorpay_signature",
    "razorpay_payment_id",
    "razorpay_order_id",
    "currency",
    "parcel_id",
  ]) {
    await queryInterface.removeColumn("payments", col).catch(() => {});
  }
}
