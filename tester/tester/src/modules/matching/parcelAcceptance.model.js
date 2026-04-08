import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";
import ParcelRequest from "./parcelRequest.model.js";
import Parcel from "../parcel/parcel.model.js";

const ParcelAcceptance = sequelize.define(
  "parcel_acceptances",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    parcel_request_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: ParcelRequest,
        key: "id",
      },
      onDelete: "CASCADE",
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
    accepted_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    acceptance_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
  },
  {
    timestamps: true,
    underscored: true,
    indexes: [
      { name: "idx_parcel_acceptances_parcel_id", fields: ["parcel_id"] },
      { name: "idx_parcel_acceptances_traveller_id", fields: ["traveller_id"] },
      { name: "idx_parcel_acceptances_parcel_request_id", fields: ["parcel_request_id"] },
    ],
  }
);

export default ParcelAcceptance;























