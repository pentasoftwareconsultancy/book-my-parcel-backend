import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const Notification = sequelize.define(
  "notifications",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM("user", "traveller", "admin"),
      allowNull: false,
    },
    type_code: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    meta: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    underscored: true,
    indexes: [
      // Fast lookup: all notifications for a user+role (main query)
      { fields: ["user_id", "role"] },
      // Fast unread count / filter
      { fields: ["user_id", "is_read"] },
      // Sort by latest — covered by created_at DESC
      { fields: ["created_at"] },
    ],
  }
);

export default Notification;
