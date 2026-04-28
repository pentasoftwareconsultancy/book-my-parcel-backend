/**
 * One-time script: adds referral_code column to user_profiles.
 * Run once: node scripts/add-referral-code-column.js
 */
import dotenv from "dotenv";
dotenv.config();
import { Sequelize } from "sequelize";
import sequelize from "../src/config/database.config.js";

const qi = sequelize.getQueryInterface();

try {
  await qi.addColumn("user_profiles", "referral_code", {
    type: Sequelize.STRING(12),
    allowNull: true,
    unique: true,
  });
  console.log("✅ Added referral_code column to user_profiles");
} catch (err) {
  if (err.message.includes("already exists")) {
    console.log("ℹ️  referral_code column already exists — nothing to do");
  } else {
    console.error("❌ Failed:", err.message);
    process.exit(1);
  }
} finally {
  await sequelize.close();
}
