import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

/**
 * Tracks referrals between users.
 * - referrer_id: the user who shared their code
 * - referred_id: the new user who signed up using the code
 * - status: PENDING → CREDITED (credited after referred user completes first booking)
 * - referrer_credit / referred_credit: wallet amounts credited to each party
 */
const Referral = sequelize.define(
  "referrals",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    referrer_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    referred_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true, // each user can only be referred once
    },
    referral_code: {
      type: DataTypes.STRING(12),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("PENDING", "CREDITED", "EXPIRED"),
      defaultValue: "PENDING",
    },
    referrer_credit: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 50, // ₹50 for the referrer
    },
    referred_credit: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 30, // ₹30 discount for the new user
    },
    credited_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    indexes: [
      { name: "idx_referrals_referrer_id",  fields: ["referrer_id"] },
      { name: "idx_referrals_referred_id",  fields: ["referred_id"], unique: true },
      { name: "idx_referrals_code",         fields: ["referral_code"] },
    ],
  }
);

export default Referral;
