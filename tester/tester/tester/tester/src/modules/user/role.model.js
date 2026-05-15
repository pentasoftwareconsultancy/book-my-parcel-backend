import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const Role = sequelize.define(
  "roles",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: DataTypes.STRING,
  },
  { timestamps: false },
);

export default Role;
