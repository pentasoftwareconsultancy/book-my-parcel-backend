import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const User = sequelize.define(
  "users",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },

    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    phone_number: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    alternate_phone: {
      type: DataTypes.STRING,
      allowNull: true,       
      defaultValue: null,     
    }, 
    // is_active: {
    //   type: DataTypes.BOOLEAN,
    //   defaultValue: true,
    // },
  },
  {
    timestamps: true,
    indexes: [
      { name: "idx_users_created_at",    fields: ["createdAt"] },
      // phone_number already has unique: true which creates an index automatically
      // adding explicit index for non-unique lookup patterns
      { name: "idx_users_phone_number",  fields: ["phone_number"] },
    ],
  }

);

export default User;
