/**
 * Migration: Add resolution fields to disputes table
 *
 * Adds four columns needed for admin dispute resolution:
 *   - resolution    ENUM  — financial outcome (REFUND_USER | RELEASE_TRAVELLER | NO_ACTION)
 *   - admin_note    TEXT  — admin's explanation of the decision
 *   - resolved_at   DATE  — timestamp of resolution
 *   - resolved_by   UUID  — admin user ID who resolved it
 *
 * All columns are nullable so existing open disputes are unaffected.
 */

"use strict";

export async function up(queryInterface, Sequelize) {
  const tableDesc = await queryInterface.describeTable("disputes");

  if (!tableDesc.resolution) {
    await queryInterface.addColumn("disputes", "resolution", {
      type: Sequelize.ENUM("REFUND_USER", "RELEASE_TRAVELLER", "NO_ACTION"),
      allowNull: true,
      comment: "Financial outcome chosen by admin on resolution",
    });
    console.log("✅ Added disputes.resolution");
  }

  if (!tableDesc.admin_note) {
    await queryInterface.addColumn("disputes", "admin_note", {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: "Admin note explaining the resolution decision",
    });
    console.log("✅ Added disputes.admin_note");
  }

  if (!tableDesc.resolved_at) {
    await queryInterface.addColumn("disputes", "resolved_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    console.log("✅ Added disputes.resolved_at");
  }

  if (!tableDesc.resolved_by) {
    await queryInterface.addColumn("disputes", "resolved_by", {
      type: Sequelize.UUID,
      allowNull: true,
      comment: "Admin user ID who resolved the dispute",
    });
    console.log("✅ Added disputes.resolved_by");
  }

  // Index for admin dashboard: filter by status + order by created_at
  try {
    await queryInterface.addIndex("disputes", ["status"], {
      name: "idx_disputes_status",
      ifNotExists: true,
    });
    await queryInterface.addIndex("disputes", ["booking_id"], {
      name: "idx_disputes_booking_id",
      ifNotExists: true,
    });
    console.log("✅ Added dispute indexes");
  } catch (err) {
    if (!err.message.includes("already exists")) throw err;
    console.warn("[Migration] Dispute index already exists — skipping");
  }

  console.log("✅ disputes resolution fields migration complete");
}

export async function down(queryInterface) {
  for (const col of ["resolution", "admin_note", "resolved_at", "resolved_by"]) {
    await queryInterface.removeColumn("disputes", col).catch(() => {});
  }
  await queryInterface.removeIndex("disputes", "idx_disputes_status").catch(() => {});
  await queryInterface.removeIndex("disputes", "idx_disputes_booking_id").catch(() => {});
}
