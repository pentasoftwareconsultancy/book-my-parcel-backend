import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const TravellerKYC = sequelize.define(
  "traveller_kyc",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    user_id: {
      type: DataTypes.UUID,
      allowNull: false
    },

    first_name: DataTypes.STRING,
    last_name: DataTypes.STRING,
    dob: DataTypes.DATEONLY,
    gender: DataTypes.STRING,
    address: DataTypes.TEXT,

    aadhar_number: DataTypes.STRING,
    pan_number: DataTypes.STRING,
    driving_number: DataTypes.STRING,

    aadhar_front: DataTypes.STRING,
    aadhar_back: DataTypes.STRING,
    pan_front: DataTypes.STRING,
    pan_back: DataTypes.STRING,
    driving_photo: DataTypes.STRING,
    selfie: DataTypes.STRING,

    account_number: DataTypes.STRING,
    account_holder: DataTypes.STRING,
    ifsc: DataTypes.STRING,
    bank_name: DataTypes.STRING,

    status: {
      type: DataTypes.ENUM("NOT_STARTED","PENDING","APPROVED","REJECTED"),
      defaultValue: "PENDING"
    }
  },
  { timestamps: true, underscored: true }
);

export default TravellerKYC;
