import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const TravellerKYC = sequelize.define(
  "TravellerKYC",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM("NOT_STARTED", "PENDING", "APPROVED", "REJECTED"),
      defaultValue: "NOT_STARTED"
    },
    document: {
      type: DataTypes.STRING,
      allowNull: true
    }
  },
  {
    // tableName: "traveller_kyc",
    timestamps: true,          // keep timestamps
    underscored: true          // ✅ automatically maps createdAt → created_at, updatedAt → updated_at
  }
);

export default TravellerKYC;
