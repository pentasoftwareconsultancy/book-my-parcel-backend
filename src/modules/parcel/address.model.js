import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const Address = sequelize.define("address", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_profile_id: { type: DataTypes.UUID, allowNull: true },
  type: { type: DataTypes.ENUM("pickup", "delivery"), allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  address: { type: DataTypes.STRING, allowNull: false },
  city: { type: DataTypes.STRING, allowNull: false },
  state: { type: DataTypes.STRING, allowNull: false },
  pincode: { type: DataTypes.STRING, allowNull: false },
  country: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: false },
  alt_phone: { type: DataTypes.STRING },
  aadhar_no: { type: DataTypes.STRING },

  // --- Geocoding & administrative hierarchy (populated from Google APIs) ---
  place_id:           { type: DataTypes.STRING(500), unique: true, allowNull: true },
  latitude:           { type: DataTypes.DECIMAL(10, 8), allowNull: true },
  longitude:          { type: DataTypes.DECIMAL(11, 8), allowNull: true },
  plus_code:          { type: DataTypes.STRING(20), allowNull: true },
  validation_status:  { type: DataTypes.ENUM("VALID", "PARTIAL", "INFERRED"), allowNull: true },
  district:           { type: DataTypes.STRING(100), allowNull: true },
  taluka:             { type: DataTypes.STRING(100), allowNull: true },
  locality:           { type: DataTypes.STRING(200), allowNull: true },
  landmarks:          { type: DataTypes.JSONB, allowNull: true },
  sub_localities:     { type: DataTypes.JSONB, allowNull: true },
  formatted_address:  { type: DataTypes.TEXT, allowNull: true },
  last_geocoded_at:   { type: DataTypes.DATE, allowNull: true },
  usage_count:        { type: DataTypes.INTEGER, defaultValue: 1, allowNull: false },
}, {
  freezeTableName: true,
  timestamps: true,
  indexes: [
    { name: "idx_address_city",           fields: ["city"] },
    { name: "idx_address_user_profile_id", fields: ["user_profile_id"] },
    { name: "idx_address_type",           fields: ["type"] },
    { name: "idx_address_place_id",       fields: ["place_id"] },
    { name: "idx_address_coordinates",    fields: ["latitude", "longitude"] },
    { name: "idx_address_city_locality",  fields: ["city", "locality"] },
  ],
});

export default Address;
