import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const BookingStatusLog = sequelize.define(
  "booking_status_logs",
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
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  { timestamps: true },
);

export default BookingStatusLog;
