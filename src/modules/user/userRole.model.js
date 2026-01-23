import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const UserRole = sequelize.define(
  "user_roles",
  {
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    timestamps: false,
  },
);

export default UserRole;
