import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

/**
 * Stores chat messages between sender and traveller for a booking.
 * Messages are scoped to a booking_id so both parties see the same thread.
 */
const ChatMessage = sequelize.define(
  "chat_messages",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    booking_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    sender_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    // "user" | "traveller" — lets the UI know which side to render on
    sender_role: {
      type: DataTypes.ENUM("user", "traveller"),
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
  },
  {
    timestamps: true,
    indexes: [
      { name: "idx_chat_booking_id",  fields: ["booking_id"] },
      { name: "idx_chat_sender_id",   fields: ["sender_id"] },
      { name: "idx_chat_created_at",  fields: ["createdAt"] },
    ],
  }
);

export default ChatMessage;
