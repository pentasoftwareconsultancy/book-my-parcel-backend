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
    vehicle_type: DataTypes.STRING,   // bike, car, truck
    vehicle_number: DataTypes.STRING,
    vehicle_model: DataTypes.STRING,
    capacity_kg: DataTypes.INTEGER,
    rating: {
      type: DataTypes.DECIMAL(2, 1),
      defaultValue: 4.8,
      validate: {
        min: 0,
        max: 5
      }
    },
    total_deliveries: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    profile_photo: DataTypes.STRING,
    status: {
      type: DataTypes.ENUM("INCOMPLETE", "PENDING", "ACTIVE", "INACTIVE"),
      defaultValue: "INCOMPLETE",
    },
    is_available: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    last_known_location: {
      type: DataTypes.GEOMETRY('POINT'),
      allowNull: true,
    },
  },
  { timestamps: true }
);

export default TravellerProfile;
