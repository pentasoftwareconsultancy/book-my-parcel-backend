import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";
import User from "../user/user.model.js";

const TravellerProfile = sequelize.define(
  "traveller_profiles",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
      onDelete: "CASCADE",
    },
    vehicle_type: DataTypes.STRING,
    capacity_kg: DataTypes.INTEGER,
    status: DataTypes.STRING,
  },
  { timestamps: true }
);

export default TravellerProfile;
