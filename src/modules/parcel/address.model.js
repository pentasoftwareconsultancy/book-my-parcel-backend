import { DataTypes } from "sequelize"
import { sequelize } from "../../config/database.config.js";

export const Address = sequelize.define("Address",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: DataTypes.STRING,
        phone: DataTypes.STRING,
        alternate_phone: DataTypes.STRING,
        address_line: DataTypes.STRING,
        city: DataTypes.STRING,
        state: DataTypes.STRING,
        pincode: DataTypes.STRING,
        country: DataTypes.STRING,
        aadhaar_number: DataTypes.STRING,

        latitude: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        longitude: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
    },




    {
        tableName: "address",
        timestamps: true
    });