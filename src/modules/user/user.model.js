import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const User = sequelize.define(
  "users",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },

    
    name: DataTypes.STRING,
    phone_number: DataTypes.STRING,
    alternate_phone: DataTypes.STRING,
    email: DataTypes.STRING,
    password: DataTypes.STRING,
    
  },
  {
    timestamps: true,
  },
);

export default User;
