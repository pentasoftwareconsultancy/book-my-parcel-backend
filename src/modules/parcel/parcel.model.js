import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const Parcel = sequelize.define(
  "parcels",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: DataTypes.UUID,
    package_size: DataTypes.STRING,
    weight: DataTypes.FLOAT,
    length: DataTypes.FLOAT,
    width: DataTypes.FLOAT,
    height: DataTypes.FLOAT,
    parcel_type: DataTypes.STRING,
    delivery_speed: DataTypes.STRING,
    parcel_value: DataTypes.FLOAT,
    description: DataTypes.TEXT,
    status: DataTypes.STRING,
  },
  { timestamps: true },
);

export default Parcel;
