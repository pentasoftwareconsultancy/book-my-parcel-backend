import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const PendingPayment = sequelize.define(
  "pending_payment",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    booking_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    traveller_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("PENDING_RECEIPT", "RECEIVED", "WITHDRAWN"),
      defaultValue: "PENDING_RECEIPT",
      comment:
        "PENDING_RECEIPT = waiting for traveller to click receive | RECEIVED = traveller received it but not yet in wallet | WITHDRAWN = moved to wallet",
    },
    delivery_ref: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: "Reference to the delivery for easy lookup",
    },
    received_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When traveller clicked 'Receive Payment'",
    },
    withdrawn_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When payment was moved to wallet",
    },
  },
  {
    freezeTableName: true,
    timestamps: true,
    indexes: [
      { name: "idx_pending_payments_booking_id", fields: ["booking_id"] },
      { name: "idx_pending_payments_traveller_id", fields: ["traveller_id"] },
      { name: "idx_pending_payments_status", fields: ["status"] },
      { name: "idx_pending_payments_delivery_ref", fields: ["delivery_ref"] },
      { name: "idx_pending_payments_traveller_status_created", fields: ["traveller_id", "status", "createdAt"] },
    ],
  }
);

export default PendingPayment;
