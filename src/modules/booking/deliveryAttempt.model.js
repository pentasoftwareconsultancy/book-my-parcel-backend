import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

/**
 * Tracks delivery attempts when the recipient is unavailable.
 * Traveller can log an attempt with a reason and reschedule.
 * After MAX_ATTEMPTS, the booking is auto-cancelled and refunded.
 */
const DeliveryAttempt = sequelize.define(
  "delivery_attempts",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    booking_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    traveller_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    attempt_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    reason: {
      type: DataTypes.ENUM(
        "recipient_unavailable",
        "wrong_address",
        "access_denied",
        "recipient_refused",
        "other"
      ),
      allowNull: false,
      defaultValue: "recipient_unavailable",
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Photo evidence of the attempt (optional)
    photo_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // Rescheduled delivery time agreed with recipient
    rescheduled_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    attempted_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: true,
    indexes: [
      { name: "idx_delivery_attempts_booking_id", fields: ["booking_id"] },
    ],
  }
);

export default DeliveryAttempt;
