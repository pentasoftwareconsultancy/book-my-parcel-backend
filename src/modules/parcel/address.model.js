import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const Address = sequelize.define(
  "address",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    type: {
      type: DataTypes.ENUM("PICKUP", "DELIVERY"),
      allowNull: false,
    },

    name: DataTypes.STRING,
    phone: DataTypes.STRING,
    alternate_phone: DataTypes.STRING,
    address: DataTypes.TEXT,
    city: DataTypes.STRING,
    state: DataTypes.STRING,
    pincode: DataTypes.STRING,
    country: DataTypes.STRING,
    aadhaar_number: DataTypes.STRING,
  },
  {
    timestamps: true,
    // underscored: true,
  }
);

export default Address;
