import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";
import TravellerProfile from "./travellerProfile.model.js";
import Address from "../parcel/address.model.js";

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
    // Address references (Phase 2: reuse enriched addresses)
    origin_address_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Address,
        key: "id",
      },
      onDelete: "RESTRICT",
    },
    dest_address_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Address,
        key: "id",
      },
      onDelete: "RESTRICT",
    },
    // Scheduling fields
    departure_date: {
      type: DataTypes.DATEONLY,
      allowNull: true, // NULL if recurring
    },
    departure_time: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    arrival_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    arrival_time: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    is_recurring: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    recurring_days: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    recurring_start_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    recurring_end_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    // Vehicle details
    vehicle_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    vehicle_number: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // Transport mode (private vehicle, bus, train)
    transport_mode: {
      type: DataTypes.ENUM("private", "bus", "train"),
      allowNull: false,
      defaultValue: "private",
    },
    // Transit stops (for bus/train routes only)
    stops_passed: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    // Transit details (bus/train specific information)
    transit_details: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Stores bus/train details: service_name, bus_number, train_number, class_type, pnr_number, seat_numbers, etc.",
    },
    max_weight_kg: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    available_capacity_kg: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0, // Will be set to max_weight_kg on creation
    },
    // Parcel preferences
    accepted_parcel_types: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    min_earning_per_delivery: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    // Route geometry and metrics (from Google Routes API)
    route_geometry: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    total_distance_km: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    total_duration_minutes: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    // Intermediate location data (for matching)
    localities_passed: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    pincodes_covered: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    talukas_passed: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    cities_passed: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    landmarks_nearby: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    // PostGIS geometry (Phase B)
    route_geom: {
      type: DataTypes.GEOMETRY("LINESTRING", 4326),
      allowNull: true,
    },
    // Status
    status: {
      type: DataTypes.ENUM("ACTIVE", "INACTIVE", "COMPLETED", "CANCELLED"),
      defaultValue: "ACTIVE",
    },
  },
  { 
    timestamps: true,
    underscored: true,
  }
);

export default TravellerRoute;
