/**
 * Migration: Phase 3 & 4 new tables
 * - chat_messages       (in-app chat between sender and traveller)
 * - delivery_attempts   (failed delivery attempt tracking)
 * - referrals           (referral system)
 * - user_profiles.referral_code column
 */

export async function up(queryInterface, Sequelize) {
  // ── 1. chat_messages ──────────────────────────────────────────────────────
  await queryInterface.createTable("chat_messages", {
    id: {
      type: Sequelize.UUID,
      primaryKey: true,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
    },
    booking_id:  { type: Sequelize.UUID, allowNull: false },
    sender_id:   { type: Sequelize.UUID, allowNull: false },
    sender_role: { type: Sequelize.ENUM("user", "traveller"), allowNull: false },
    message:     { type: Sequelize.TEXT, allowNull: false },
    is_read:     { type: Sequelize.BOOLEAN, defaultValue: false },
    createdAt:   { type: Sequelize.DATE, defaultValue: Sequelize.literal("NOW()") },
    updatedAt:   { type: Sequelize.DATE, defaultValue: Sequelize.literal("NOW()") },
  });

  await queryInterface.addIndex("chat_messages", ["booking_id"], { name: "idx_chat_booking_id" });
  await queryInterface.addIndex("chat_messages", ["sender_id"],  { name: "idx_chat_sender_id" });
  console.log("✅ Created chat_messages table");

  // ── 2. delivery_attempts ──────────────────────────────────────────────────
  await queryInterface.createTable("delivery_attempts", {
    id: {
      type: Sequelize.UUID,
      primaryKey: true,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
    },
    booking_id:     { type: Sequelize.UUID, allowNull: false },
    traveller_id:   { type: Sequelize.UUID, allowNull: false },
    attempt_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
    reason: {
      type: Sequelize.ENUM(
        "recipient_unavailable",
        "wrong_address",
        "access_denied",
        "recipient_refused",
        "other"
      ),
      allowNull: false,
      defaultValue: "recipient_unavailable",
    },
    notes:          { type: Sequelize.TEXT, allowNull: true },
    photo_url:      { type: Sequelize.STRING, allowNull: true },
    rescheduled_at: { type: Sequelize.DATE, allowNull: true },
    attempted_at:   { type: Sequelize.DATE, defaultValue: Sequelize.literal("NOW()") },
    createdAt:      { type: Sequelize.DATE, defaultValue: Sequelize.literal("NOW()") },
    updatedAt:      { type: Sequelize.DATE, defaultValue: Sequelize.literal("NOW()") },
  });

  await queryInterface.addIndex("delivery_attempts", ["booking_id"], { name: "idx_delivery_attempts_booking_id" });
  console.log("✅ Created delivery_attempts table");

  // ── 3. referrals ──────────────────────────────────────────────────────────
  await queryInterface.createTable("referrals", {
    id: {
      type: Sequelize.UUID,
      primaryKey: true,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
    },
    referrer_id:     { type: Sequelize.UUID, allowNull: false },
    referred_id:     { type: Sequelize.UUID, allowNull: false, unique: true },
    referral_code:   { type: Sequelize.STRING(12), allowNull: false },
    status: {
      type: Sequelize.ENUM("PENDING", "CREDITED", "EXPIRED"),
      defaultValue: "PENDING",
    },
    referrer_credit: { type: Sequelize.DECIMAL(10, 2), defaultValue: 50 },
    referred_credit: { type: Sequelize.DECIMAL(10, 2), defaultValue: 30 },
    credited_at:     { type: Sequelize.DATE, allowNull: true },
    createdAt:       { type: Sequelize.DATE, defaultValue: Sequelize.literal("NOW()") },
    updatedAt:       { type: Sequelize.DATE, defaultValue: Sequelize.literal("NOW()") },
  });

  await queryInterface.addIndex("referrals", ["referrer_id"],   { name: "idx_referrals_referrer_id" });
  await queryInterface.addIndex("referrals", ["referral_code"], { name: "idx_referrals_code" });
  console.log("✅ Created referrals table");

  // ── 4. user_profiles.referral_code column ─────────────────────────────────
  const tableDesc = await queryInterface.describeTable("user_profiles");
  if (!tableDesc.referral_code) {
    await queryInterface.addColumn("user_profiles", "referral_code", {
      type: Sequelize.STRING(12),
      allowNull: true,
      unique: true,
    });
    console.log("✅ Added referral_code to user_profiles");
  }
}

export async function down(queryInterface) {
  await queryInterface.dropTable("chat_messages").catch(() => {});
  await queryInterface.dropTable("delivery_attempts").catch(() => {});
  await queryInterface.dropTable("referrals").catch(() => {});
  await queryInterface.removeColumn("user_profiles", "referral_code").catch(() => {});
}
