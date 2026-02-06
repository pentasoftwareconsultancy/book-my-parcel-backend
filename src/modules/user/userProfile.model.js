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
    full_name: DataTypes.STRING,
    address: DataTypes.TEXT,
    city: DataTypes.STRING,
    lat: DataTypes.DECIMAL,
    lng: DataTypes.DECIMAL,
  },
  { timestamps: true },
);

export default UserProfile;
