import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const Wallet = sequelize.define(
  "wallets",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    balance: {
      type: DataTypes.DECIMAL,
      defaultValue: 0,
    },
  },
  { timestamps: true },
);

export default Wallet;
