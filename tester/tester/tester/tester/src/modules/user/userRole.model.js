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
      defaultValue: DataTypes.NOW, // 🔥 automatically fills current timestamp
    },
  },
  {
    tableName: "user_roles",
    timestamps: false, // we don’t need Sequelize auto timestamps here
  }
);

export default UserRole;
