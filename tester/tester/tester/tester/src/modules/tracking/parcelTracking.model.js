// modules/tracking/parcelTracking.model.js
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
    vehicle_type: {
      type: DataTypes.ENUM("car", "bike", "truck", "walk"),
      defaultValue: "bike",
    },
    pickup_lat:    { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    pickup_lng:    { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    delivery_lat:  { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    delivery_lng:  { type: DataTypes.DECIMAL(10, 7), allowNull: false },
    encoded_polyline: { type: DataTypes.TEXT,    allowNull: true },
    distance_meters:  { type: DataTypes.INTEGER, allowNull: true },
    duration_seconds: { type: DataTypes.INTEGER, allowNull: true },
    traveller_lat: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    traveller_lng: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    speed:   { type: DataTypes.FLOAT, defaultValue: 0 },
    heading: { type: DataTypes.FLOAT, defaultValue: 0 },
    status: {
      type: DataTypes.ENUM("initiated", "picked_up", "in_transit", "delivered", "failed"),
      defaultValue: "initiated",
    },
  },
  {
    timestamps: true,
    tableName: "parcel_trackings",
  }
);

export default ParcelTracking;