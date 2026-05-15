import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

import {
  PAYMENT_STATUS
} from "../../utils/constants.js";

const Payment = sequelize.define(
  "payments",
  {

    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    /* ✅ ADD THIS */

    parcel_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    /* Keep booking_id optional */

    booking_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    amount: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    currency: {
      type: DataTypes.STRING,
      defaultValue: "INR",
    },

    razorpay_order_id: {
      type: DataTypes.STRING,
      // Unique at DB level — prevents duplicate bookings when concurrent
      // webhook/callback requests race through verifyPaymentService.
      unique: "uq_payments_razorpay_order_id",
      allowNull: true,
    },

    razorpay_payment_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    razorpay_signature: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM(
        ...Object.values(PAYMENT_STATUS)
      ),
      defaultValue: PAYMENT_STATUS.PENDING,
    },

    released_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Set when payment is released to traveller wallet",
    },

  },
  {
    timestamps: true,
    indexes: [
      { name: "idx_payments_parcel_id", fields: ["parcel_id"] },
      { name: "idx_payments_booking_id", fields: ["booking_id"] },
      { name: "idx_payments_status", fields: ["status"] },
      { name: "idx_payments_created_at", fields: ["createdAt"] },
      { name: "idx_payments_parcel_status", fields: ["parcel_id", "status"] },
      { name: "idx_payments_status_released_at", fields: ["status", "released_at"] },
      { name: "idx_payments_razorpay_order_id", fields: ["razorpay_order_id"] },
      { name: "idx_payments_razorpay_payment_id", fields: ["razorpay_payment_id"] },
    ],
  }
);

export default Payment;
