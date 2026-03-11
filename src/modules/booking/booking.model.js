import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const Booking = sequelize.define("booking", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  parcel_id: { type: DataTypes.UUID, allowNull: false },
  traveller_id: { type: DataTypes.UUID, allowNull: true }, // optional, assigned later
  status: { type: DataTypes.ENUM("CREATED","MATCHING","CONFIRMED","IN_TRANSIT","DELIVERED","CANCELLED"), defaultValue: "CREATED" },
  assigned_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  trip_id: { type: DataTypes.UUID, allowNull: true }, //You Must Add This Otherwise route column will not work.
  booking_ref:  { type: DataTypes.STRING(20), unique: true, allowNull: true },
  tracking_ref: { type: DataTypes.STRING(20), unique: true, allowNull: true },
  delivery_ref: { type: DataTypes.STRING(20), unique: true, allowNull: true },
}, {
  freezeTableName: true,
  timestamps: true
});

// Define associations
Booking.associate = function(models) {
  Booking.belongsTo(models.Parcel, { foreignKey: 'parcel_id', as: 'parcel' });
};

export default Booking;
