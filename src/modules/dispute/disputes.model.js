import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const Dispute = sequelize.define(
  "disputes",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    booking_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    raised_by: {
      type: DataTypes.UUID,
      allowNull: false,
      // user_id of whoever raised it (user or traveller)
    },
    role: {
      type: DataTypes.ENUM("USER", "TRAVELLER"),
      allowNull: false,
      // which side raised it — drives the label in admin panel
    },
    dispute_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("OPEN", "IN_PROGRESS", "RESOLVED"),
      defaultValue: "OPEN",
    },
    // ── Resolution fields (set when admin resolves) ──────────────────────────
    resolution: {
      type: DataTypes.ENUM("REFUND_USER", "RELEASE_TRAVELLER", "NO_ACTION"),
      allowNull: true,
      comment: "Financial outcome chosen by admin on resolution",
    },
    admin_note: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Admin's internal note explaining the resolution decision",
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    resolved_by: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Admin user ID who resolved the dispute",
    },
  },
  {
    timestamps: true,
    underscored: true,
    indexes: [
      { name: "idx_disputes_booking_id", fields: ["booking_id"] },
      { name: "idx_disputes_raised_by", fields: ["raised_by"] },
      { name: "idx_disputes_status", fields: ["status"] },
      { name: "idx_disputes_created_at", fields: ["created_at"] },
      { name: "idx_disputes_booking_raised_by", fields: ["booking_id", "raised_by"] },
    ],
  }
);

// Define associations
Dispute.associate = function(models) {
  Dispute.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
  Dispute.belongsTo(models.User, { foreignKey: 'raised_by', as: 'raisedBy' });
};

export default Dispute;
