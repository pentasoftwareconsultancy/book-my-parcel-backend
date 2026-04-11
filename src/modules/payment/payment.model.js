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
    },

    razorpay_payment_id: {
      type: DataTypes.STRING,
    },

    razorpay_signature: {
      type: DataTypes.STRING,
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
  }
);

export default Payment;