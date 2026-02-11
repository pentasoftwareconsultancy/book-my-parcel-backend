import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const Payment = sequelize.define(
  "payments",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    booking_id: DataTypes.UUID,
    amount: DataTypes.FLOAT,
    status: DataTypes.STRING,
  },
  { timestamps: true },
);

export default Payment;
