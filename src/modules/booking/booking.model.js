import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const Booking = sequelize.define(
  "bookings",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    parcel_id: DataTypes.UUID,
    trip_id: DataTypes.UUID,
    traveller_id: DataTypes.UUID,
    amount: DataTypes.FLOAT,
    status: DataTypes.STRING,
  },
  { timestamps: true },
);

export default Booking;
