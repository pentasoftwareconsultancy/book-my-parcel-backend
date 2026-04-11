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
    assigned_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "user_roles",
    timestamps: false,
    indexes: [
      { name: "idx_user_roles_user_id", fields: ["user_id"] },
      { name: "idx_user_roles_role_id", fields: ["role_id"] },
    ],
  }
);

export default UserRole;
