import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const Booking = sequelize.define("booking", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  parcel_id: { type: DataTypes.UUID, allowNull: false },
  traveller_id: { type: DataTypes.UUID, allowNull: true }, // optional, assigned later
  status: { type: DataTypes.ENUM("CREATED","MATCHING","CONFIRMED","IN_TRANSIT","DELIVERED","CANCELLED"), defaultValue: "CREATED" },
  assigned_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  freezeTableName: true,
  timestamps: true
});

export default Booking;
