import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const UserProfile = sequelize.define(
  "user_profiles",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    name: DataTypes.STRING,
    address: DataTypes.TEXT,
    city: DataTypes.STRING,
    state: DataTypes.STRING,
    pincode: DataTypes.STRING,  
    lat: DataTypes.DECIMAL,
    lng: DataTypes.DECIMAL,
    avatar_url: DataTypes.STRING,
    referral_code: {
      type: DataTypes.STRING(12),
      allowNull: true,
      unique: true,
    },

  },
  { timestamps: true }
);

export default UserProfile;
