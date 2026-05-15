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
  { timestamps: true },
);

export default TravellerTrip;
