import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";
import TravellerProfile from "./travellerProfile.model.js";

const TravellerRoute = sequelize.define(
  "traveller_routes",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    traveller_profile_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: TravellerProfile,
        key: "id",
      },
      onDelete: "CASCADE",
    },
    // Form 1: Route Details
    origin_city: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    origin_state: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    stops: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    destination_city: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    destination_state: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    departure_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    departure_time: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    arrival_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    arrival_time: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    is_recurring: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    recurring_days: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    // Form 2: Vehicle & Capacity
    vehicle_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    vehicle_number: DataTypes.STRING,
    max_weight_kg: DataTypes.INTEGER,
    available_space_description: DataTypes.TEXT,
    // Form 3: Parcel Preferences
    accepted_parcel_types: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    min_earning_per_delivery: DataTypes.DECIMAL(10, 2),
    status: {
      type: DataTypes.ENUM("ACTIVE", "INACTIVE", "COMPLETED"),
      defaultValue: "ACTIVE",
    },
  },
  { 
    timestamps: true,
    underscored: true,
  }
);

export default TravellerRoute;
