import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const Booking = sequelize.define("booking", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  parcel_id: { type: DataTypes.UUID, allowNull: false },
  traveller_id: { type: DataTypes.UUID, allowNull: true }, // optional, assigned later
  user_id: { type: DataTypes.UUID, allowNull: true }, // parcel owner (from parcel.user_id)
  status: { type: DataTypes.ENUM("CREATED","MATCHING","CONFIRMED","PICKUP","IN_TRANSIT","DELIVERED","CANCELLED"), defaultValue: "CREATED" },
  assigned_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  trip_id: { type: DataTypes.UUID, allowNull: true }, //You Must Add This Otherwise route column will not work.
  booking_ref:  { type: DataTypes.STRING(20), unique: true, allowNull: true },
  tracking_ref: { type: DataTypes.STRING(20), unique: true, allowNull: true },
  delivery_ref: { type: DataTypes.STRING(20), unique: true, allowNull: true },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: true }, // booking amount
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
  payment_mode: { type: DataTypes.ENUM('PAY_NOW', 'PAY_AFTER_DELIVERY'), defaultValue: 'PAY_AFTER_DELIVERY', comment: 'Whether payment is done upfront or after delivery' },
}, {
  freezeTableName: true,
  timestamps: true,
  indexes: [
    { name: "idx_bookings_traveller_id",              fields: ["traveller_id"] },
    { name: "idx_bookings_parcel_id",                 fields: ["parcel_id"] },
    { name: "idx_bookings_status",                    fields: ["status"] },
    { name: "idx_bookings_created_at",                fields: ["createdAt"] },

      { name: "idx_bookings_status_created", fields: ["status", "createdAt"] },

    // composite: covers fetchTravellerDeliveries fully
    // WHERE traveller_id = ? AND status IN (...) ORDER BY createdAt DESC
    { name: "idx_bookings_traveller_status_created",  fields: ["traveller_id", "status", "createdAt"] },
  ],
});

// Define associations
Booking.associate = function(models) {
  Booking.belongsTo(models.Parcel, { foreignKey: 'parcel_id', as: 'parcel' });
  Booking.belongsTo(models.User, { foreignKey: 'traveller_id', as: 'traveller' });
  Booking.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
};

export default Booking;
