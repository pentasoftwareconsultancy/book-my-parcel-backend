import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const WalletTransaction = sequelize.define(
  "wallet_transactions",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    wallet_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING, // CREDIT / DEBIT
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL,
      allowNull: false,
    },
    reason: DataTypes.STRING,
  },
  { timestamps: true },
);

export default WalletTransaction;
