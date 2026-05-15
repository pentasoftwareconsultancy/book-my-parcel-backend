import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const TravellerTrip = sequelize.define(
  "traveller_trips",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    traveller_id: DataTypes.UUID,
    source_city: DataTypes.STRING,
    destination_city: DataTypes.STRING,
    available_weight: DataTypes.INTEGER,
    status: DataTypes.STRING,
  },
  {
    timestamps: true,
    indexes: [
      { name: "idx_traveller_trips_traveller_id", fields: ["traveller_id"] },
      { name: "idx_traveller_trips_status", fields: ["status"] },
      { name: "idx_traveller_trips_city_status", fields: ["source_city", "destination_city", "status"] },
    ],
  },
);

export default TravellerTrip;
