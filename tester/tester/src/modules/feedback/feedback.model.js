// MODEL FILE
// A Sequelize model is a JavaScript class that maps to a DB table.
// It defines the shape of the data and lets you query/insert/update rows
// using JavaScript instead of raw SQL.

import { DataTypes } from "sequelize";
// DataTypes is Sequelize's type system — maps JS types to PostgreSQL column types

import sequelize from "../../config/database.config.js";
// The shared Sequelize instance (DB connection) — imported so this model
// is registered on the same connection as all other models

const Feedback = sequelize.define(
  "feedbacks",   // table name in PostgreSQL
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4, // Sequelize generates UUID on insert
    },

    booking_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      // unique: true here enforces one feedback per booking at the DB level
      // Even if the API is called twice, the DB will reject the second insert
    },

    parcel_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      // The user_id of the person who sent the parcel and is now rating
    },

    traveller_id: {
      type: DataTypes.UUID,
      allowNull: false,
      // The traveller_profile id — used to update their average rating
    },

    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1, // Sequelize-level validation — runs before hitting the DB
        max: 5, // Prevents invalid ratings like 0 or 10
      },
    },

    // tags: {
    //   type: DataTypes.JSONB,
    //   allowNull: true,
    //   // Stores array like ["On Time", "Friendly"] as binary JSON
    //   // JSONB is indexable and faster than plain JSON in PostgreSQL
    // },

    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    timestamps: true,    // auto-manages createdAt and updatedAt columns
    underscored: true,   // converts camelCase field names to snake_case in DB
      // e.g. reviewerId → reviewer_id in the actual SQL
      indexes: [
  { fields: ["traveller_id"] },
  { fields: ["booking_id"] }
]
  }
);

export default Feedback;
