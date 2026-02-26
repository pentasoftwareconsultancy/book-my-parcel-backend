import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";
import { KYC_STATUS } from "../../middlewares/role.middleware.js";


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

    // status: {
    //   type: DataTypes.ENUM("NOT_STARTED","PENDING","APPROVED","REJECTED"),
    //   defaultValue: "PENDING"
    // }

 status: {
  type: DataTypes.ENUM(...Object.values(KYC_STATUS)),
  defaultValue: KYC_STATUS.NOT_STARTED
}


  },
  { timestamps: true, underscored: true }
);

TravellerKYC.addHook('beforeCreate', (instance) => {
  // Mask Aadhar
  if (instance.aadhar_number && instance.aadhar_number.length === 12 && !instance.aadhar_number.includes('X')) {
    instance.aadhar_number = 'X'.repeat(8) + instance.aadhar_number.slice(-4);
  }
  
  // Mask PAN (show only last 4 characters)
  if (instance.pan_number && instance.pan_number.length === 10 && !instance.pan_number.includes('X')) {
    instance.pan_number = 'X'.repeat(6) + instance.pan_number.slice(-4);
  }
});

TravellerKYC.addHook('beforeUpdate', (instance) => {
  // Mask Aadhar
  if (instance.aadhar_number && instance.aadhar_number.length === 12 && !instance.aadhar_number.includes('X')) {
    instance.aadhar_number = 'X'.repeat(8) + instance.aadhar_number.slice(-4);
  }
  
  // Mask PAN (show only last 4 characters)
  if (instance.pan_number && instance.pan_number.length === 10 && !instance.pan_number.includes('X')) {
    instance.pan_number = 'X'.repeat(6) + instance.pan_number.slice(-4);
  }
});



export default TravellerKYC;
