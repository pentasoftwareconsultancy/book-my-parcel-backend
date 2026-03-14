import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";
import Address from "./address.model.js";

const Parcel = sequelize.define(
  "parcel",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: { type: DataTypes.UUID, allowNull: false },
    parcel_ref: { type: DataTypes.STRING(20), unique: true, allowNull: true },  //parcel id 
    package_size: {
      type: DataTypes.ENUM("small", "medium", "large", "extra_large"),
      allowNull: false,
    },

    weight: { type: DataTypes.FLOAT, allowNull: false },
    length: { type: DataTypes.FLOAT },
    width: { type: DataTypes.FLOAT },
    height: { type: DataTypes.FLOAT },
    description: { type: DataTypes.TEXT },
    // Values: 'SHORT_DISTANCE' | 'LONG_DISTANCE' (set by route calculation, enforced at app level)
    parcel_type: { type: DataTypes.STRING, allowNull: true },
    value: { type: DataTypes.FLOAT },
    notes: { type: DataTypes.TEXT },
    photos: { type: DataTypes.JSON },
    pickup_address_id: { type: DataTypes.UUID, allowNull: false },
    delivery_address_id: { type: DataTypes.UUID, allowNull: false },
    selected_partner_id: { type: DataTypes.UUID },
    price_quote: { type: DataTypes.FLOAT },

    // --- Route data (populated after geocoding both addresses) ---
    route_distance_km:       { type: DataTypes.FLOAT, allowNull: true },
    route_duration_minutes:  { type: DataTypes.FLOAT, allowNull: true },
    intermediate_cities:     { type: DataTypes.JSONB, allowNull: true },
    route_geometry:          { type: DataTypes.TEXT, allowNull: true },

    status: {
      type: DataTypes.ENUM(
        "CREATED",
        "MATCHING",
        "CONFIRMED",
        "IN_TRANSIT",
        "DELIVERED",
        "CANCELLED",
      ),
      defaultValue: "CREATED",
    },
  },
  { freezeTableName: true, timestamps: true },
);

export default Parcel;
