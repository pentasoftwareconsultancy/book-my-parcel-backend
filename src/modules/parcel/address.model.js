import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const Address = sequelize.define("address", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_profile_id: { type: DataTypes.UUID, allowNull: true },
  type: { type: DataTypes.ENUM("pickup","delivery"), allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  address: { type: DataTypes.STRING, allowNull: false },
  city: { type: DataTypes.STRING, allowNull: false },
  state: { type: DataTypes.STRING, allowNull: false },
  pincode: { type: DataTypes.STRING, allowNull: false },
  country: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: false },
  alt_phone: { type: DataTypes.STRING },
  aadhar_no: { type: DataTypes.STRING }
}, {
  freezeTableName: true,
  timestamps: true,
  indexes: [
    { name: "idx_address_city", fields: ["city"] },
    { name: "idx_address_user_profile_id", fields: ["user_profile_id"] },
    { name: "idx_address_type", fields: ["type"] }
  ]
});

export default Address;
