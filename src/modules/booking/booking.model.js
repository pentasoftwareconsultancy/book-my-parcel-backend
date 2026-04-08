import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const Booking = sequelize.define("booking", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  parcel_id: { type: DataTypes.UUID, allowNull: false },
  traveller_id: { type: DataTypes.UUID, allowNull: true }, // optional, assigned later
  status: { type: DataTypes.ENUM("CREATED","MATCHING","CONFIRMED","PICKUP","IN_TRANSIT","DELIVERED","CANCELLED"), defaultValue: "CREATED" },
  assigned_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  trip_id: { type: DataTypes.UUID, allowNull: true }, //You Must Add This Otherwise route column will not work.
  booking_ref:  { type: DataTypes.STRING(20), unique: true, allowNull: true },
  tracking_ref: { type: DataTypes.STRING(20), unique: true, allowNull: true },
  delivery_ref: { type: DataTypes.STRING(20), unique: true, allowNull: true },
  // OTP fields for verification
  pickup_otp: { type: DataTypes.STRING(4), allowNull: true },
  delivery_otp: { type: DataTypes.STRING(4), allowNull: true },
  // OTP tracking fields
  pickup_otp_generated_at: { type: DataTypes.DATE, allowNull: true },
  pickup_otp_attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
  pickup_verified_at: { type: DataTypes.DATE, allowNull: true },
  delivery_otp_generated_at: { type: DataTypes.DATE, allowNull: true },
  delivery_otp_attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
  delivered_at: { type: DataTypes.DATE, allowNull: true },
  pickup_otp_locked_until: { type: DataTypes.DATE, allowNull: true },
  delivery_otp_locked_until: { type: DataTypes.DATE, allowNull: true },
}, {
  freezeTableName: true,
  timestamps: true
});

// Define associations
Booking.associate = function(models) {
  Booking.belongsTo(models.Parcel, { foreignKey: 'parcel_id', as: 'parcel' });
};

export default Booking;
