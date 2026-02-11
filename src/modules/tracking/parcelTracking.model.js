import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const ParcelTracking = sequelize.define(
  "parcel_tracking",
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
    lat: DataTypes.DECIMAL,
    lng: DataTypes.DECIMAL,
  },
  { timestamps: true },
);

export default ParcelTracking;
