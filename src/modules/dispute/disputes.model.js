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
  },
  {
    timestamps: true,
    underscored: true,
  }
);

// Define associations
Dispute.associate = function(models) {
  Dispute.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
  Dispute.belongsTo(models.User, { foreignKey: 'raised_by', as: 'raisedBy' });
};

export default Dispute;
