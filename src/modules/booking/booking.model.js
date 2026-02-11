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
    user_id: DataTypes.UUID,
    parcel_id: DataTypes.UUID,

    pickup_address_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    delivery_address_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    amount: DataTypes.FLOAT,

    status: {
      type: DataTypes.ENUM(
        "CREATED",
        "MATCHING",
        "CONFIRMED",
        "IN_TRANSIT",
        "DELIVERED",
        "CANCELLED"
      ),
      defaultValue: "CREATED",
    },
  },
  { timestamps: true },
);

export default Booking;
