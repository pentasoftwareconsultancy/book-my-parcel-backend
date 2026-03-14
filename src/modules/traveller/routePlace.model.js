import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";
import TravellerRoute from "./travellerRoute.model.js";

const RoutePlace = sequelize.define(
  "route_places",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
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
    place_id: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    place_type: {
      type: DataTypes.ENUM("locality", "city", "taluka", "pincode", "landmark"),
      allowNull: false,
    },
    place_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
    },
  },
  {
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: false,
  }
);

export default RoutePlace;
