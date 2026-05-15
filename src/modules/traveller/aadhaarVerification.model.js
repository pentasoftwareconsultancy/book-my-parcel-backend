import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const AadhaarVerification = sequelize.define(
  "aadhaar_verifications",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    traveller_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    aadhaar_no: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: DataTypes.STRING, // PENDING / VERIFIED / REJECTED
    verified_by: DataTypes.UUID, // admin user id
  },
  {
    timestamps: true,
    indexes: [
      { name: "idx_aadhaar_verifications_traveller_id", fields: ["traveller_id"] },
      { name: "idx_aadhaar_verifications_status", fields: ["status"] },
      { name: "idx_aadhaar_verifications_verified_by", fields: ["verified_by"] },
    ],
  },
);

export default AadhaarVerification;
