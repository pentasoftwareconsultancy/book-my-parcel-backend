/**
 * Migration: Add missing indexes on hot query columns
 *
 * The existing 20260410000000-add-performance-indexes.js covers the main tables.
 * This migration adds the remaining indexes identified in the Week 3 audit:
 *
 *   - payments(status)                  — payment status filter queries
 *   - payments(booking_id)              — join from booking side
 *   - wallet_transactions(wallet_id)    — getWalletTransactions: WHERE wallet_id = ?
 *   - wallet_transactions(createdAt)    — ORDER BY createdAt DESC
 *   - wallets(user_id)                  — already UNIQUE but no explicit index — add for clarity
 *   - parcel_acceptances(parcel_id)     — getParcelAcceptances: WHERE parcel_id = ?
 *   - parcel_acceptances(traveller_id)  — traveller's accepted parcels
 *   - parcel_acceptances(status)        — filter by status
 *   - booking(status, createdAt)        — composite for admin dashboard ORDER BY
 *   - address(place_id)                 — getOrCreateAddress lookup by place_id
 *   - notifications(user_id, is_read)   — unread count query
 *   - notifications(createdAt)          — ORDER BY createdAt DESC
 *
 * All use ifNotExists: true so the migration is safe to re-run.
 */

"use strict";

export async function up(queryInterface) {
  const add = async (table, fields, name) => {
    try {
      await queryInterface.addIndex(table, fields, { name, ifNotExists: true });
    } catch (err) {
      // "already exists" is safe to ignore — model-level indexes may have created them
      if (!err.message.includes("already exists")) throw err;
      console.warn(`[Migration] Index ${name} already exists — skipping`);
    }
  };

  // ── payments ──────────────────────────────────────────────────────────────
  await add("payments", ["status"],     "idx_payments_status");
  await add("payments", ["booking_id"], "idx_payments_booking_id");

  // ── wallet_transactions ───────────────────────────────────────────────────
  await add("wallet_transactions", ["wallet_id"],           "idx_wallet_tx_wallet_id");
  await add("wallet_transactions", ["createdAt"],           "idx_wallet_tx_created_at");
  await add("wallet_transactions", ["wallet_id", "createdAt"], "idx_wallet_tx_wallet_created");

  // ── wallets ───────────────────────────────────────────────────────────────
  // user_id is UNIQUE — the unique constraint creates an index automatically,
  // but we add an explicit one so it shows up in EXPLAIN plans clearly.
  await add("wallets", ["user_id"], "idx_wallets_user_id");

  // ── parcel_acceptances ────────────────────────────────────────────────────
  await add("parcel_acceptances", ["parcel_id"],   "idx_parcel_acceptances_parcel_id");
  await add("parcel_acceptances", ["traveller_id"],"idx_parcel_acceptances_traveller_id");
  // Note: parcel_acceptances has no status column in the current schema.
  // The composite index below covers the most common query pattern.
  await add("parcel_acceptances", ["parcel_id", "traveller_id"], "idx_parcel_acceptances_parcel_traveller");

  // ── booking (additional composite) ───────────────────────────────────────
  // admin dashboard: ORDER BY createdAt DESC with status filter
  await add("booking", ["status", "createdAt"], "idx_bookings_status_created");

  // ── address ───────────────────────────────────────────────────────────────
  // getOrCreateAddress: WHERE place_id = ? (most common cache lookup)
  await add("address", ["place_id"], "idx_address_place_id");
  // fallback lookup: WHERE address = ? AND city = ? AND pincode = ?
  await add("address", ["city", "pincode"], "idx_address_city_pincode");

  // ── notifications ─────────────────────────────────────────────────────────
  // notifications uses snake_case timestamps (created_at, not createdAt)
  await add("notifications", ["user_id", "is_read"], "idx_notifications_user_unread");
  await add("notifications", ["created_at"],          "idx_notifications_created_at");

  console.log("✅ Missing hot-column indexes added successfully");
}

export async function down(queryInterface) {
  const indexes = [
    ["payments",           "idx_payments_status"],
    ["payments",           "idx_payments_booking_id"],
    ["wallet_transactions","idx_wallet_tx_wallet_id"],
    ["wallet_transactions","idx_wallet_tx_created_at"],
    ["wallet_transactions","idx_wallet_tx_wallet_created"],
    ["parcel_acceptances", "idx_parcel_acceptances_parcel_id"],
    ["parcel_acceptances", "idx_parcel_acceptances_traveller_id"],
    ["parcel_acceptances", "idx_parcel_acceptances_parcel_traveller"],
    ["booking",            "idx_bookings_status_created"],
    ["address",            "idx_address_place_id"],
    ["address",            "idx_address_city_pincode"],
    ["notifications",      "idx_notifications_user_unread"],
    ["notifications",      "idx_notifications_created_at"],
  ];

  for (const [table, name] of indexes) {
    try {
      await queryInterface.removeIndex(table, name);
    } catch (err) {
      console.warn(`[Migration] Could not remove index ${name} on ${table}:`, err.message);
    }
  }
}
