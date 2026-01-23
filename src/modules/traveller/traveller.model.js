import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const TravellerProfile = sequelize.define(
  "traveller_profiles",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: DataTypes.UUID,
    vehicle_type: DataTypes.STRING,
    capacity_kg: DataTypes.INTEGER,
    status: DataTypes.STRING,
  },
  { timestamps: true },
);

export default TravellerProfile;
