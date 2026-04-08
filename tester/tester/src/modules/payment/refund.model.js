import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const Refund = sequelize.define(
  "refunds",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    payment_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL,
      allowNull: false,
    },
    status: DataTypes.STRING, // REQUESTED / COMPLETED
  },
  { timestamps: true },
);

export default Refund;
