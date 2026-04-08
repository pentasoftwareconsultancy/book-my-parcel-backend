import { DataTypes } from "sequelize";
import sequelize from "../../config/database.config.js";

const ParcelProof = sequelize.define(
  "parcel_proofs",
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
    type: {
      type: DataTypes.STRING, // PICKUP / DELIVERY
      allowNull: false,
    },
    image_url: DataTypes.STRING,
  },
  { timestamps: true },
);

export default ParcelProof;
