import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },

    define: {
      freezeTableName: true,
      // underscored: true,
      underscored: false,
      timestamps: true,
    },
  },
);

export default sequelize;
