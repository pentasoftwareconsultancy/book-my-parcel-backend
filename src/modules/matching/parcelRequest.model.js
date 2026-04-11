import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";
import Parcel from "../parcel/parcel.model.js";
import TravellerRoute from "../traveller/travellerRoute.model.js";

const ParcelRequest = sequelize.define(
  "parcel_requests",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    parcel_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Parcel,
        key: "id",
      },
      onDelete: "CASCADE",
    },
    traveller_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    route_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: TravellerRoute,
        key: "id",
      },
      onDelete: "CASCADE",
    },
    match_score: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    detour_km: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    detour_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("SENT", "INTERESTED", "ACCEPTED", "REJECTED", "EXPIRED", "SELECTED", "NOT_SELECTED"),
      defaultValue: "SENT",
    },
    sent_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    responded_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    underscored: true,
    indexes: [
      { name: "idx_parcel_requests_parcel_id",                  fields: ["parcel_id"] },
      { name: "idx_parcel_requests_traveller_id",               fields: ["traveller_id"] },
      { name: "idx_parcel_requests_status",                     fields: ["status"] },
      { name: "idx_parcel_requests_expires_at",                 fields: ["expires_at"] },
      { name: "idx_parcel_requests_route_id",                   fields: ["route_id"] },
      // composite: covers fetchTravellerParcelRequests fully
      // WHERE traveller_id = ? AND status IN (...) ORDER BY created_at DESC
      { name: "idx_parcel_requests_traveller_status_created",   fields: ["traveller_id", "status", "created_at"] },
    ],
  }
);

export default ParcelRequest;
