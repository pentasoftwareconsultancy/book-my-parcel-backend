import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";
import Address from "./address.model.js";

const Parcel = sequelize.define(
  "parcel",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    package_size: { type: DataTypes.ENUM("small","medium","large","extra_large"), allowNull: false },
    delivery_speed: { type: DataTypes.ENUM("standard","express","same_day"), allowNull: false },
    weight: { type: DataTypes.FLOAT, allowNull: false },
    length: { type: DataTypes.FLOAT },
    width: { type: DataTypes.FLOAT },
    height: { type: DataTypes.FLOAT },
    description: { type: DataTypes.TEXT },
    parcel_type: { type: DataTypes.STRING },
    value: { type: DataTypes.FLOAT },
    notes: { type: DataTypes.TEXT },
    photos: { type: DataTypes.JSON },
    pickup_address_id: { type: DataTypes.UUID, allowNull: false },
    delivery_address_id: { type: DataTypes.UUID, allowNull: false },
    selected_partner_id: { type: DataTypes.UUID },
    price_quote: { type: DataTypes.FLOAT },
    status: { 
  type: DataTypes.ENUM(
    "CREATED",
    "MATCHING",
    "CONFIRMED",
    "IN_TRANSIT",
    "DELIVERED",
    "CANCELLED"
  ),
  defaultValue: "CREATED" 
}

  },
  { freezeTableName: true, timestamps: true }
);



export default Parcel;
