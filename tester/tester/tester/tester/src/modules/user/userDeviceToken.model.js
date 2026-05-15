import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const UserDeviceToken = sequelize.define(
  "user_device_tokens",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    token: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    device_type: {
      type: DataTypes.STRING,
      defaultValue: "mobile",
    },
  },
  {
    timestamps: true,
    underscored: true,
    indexes: [
      { name: "idx_user_device_tokens_user_id", fields: ["user_id"] },
      { name: "idx_user_device_tokens_token", fields: ["token"] },
    ],
  }
);

export default UserDeviceToken;
