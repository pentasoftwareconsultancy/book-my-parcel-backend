import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

let sequelize;

if (process.env.DATABASE_URL) {
  // 🔥 Render + Neon production DB
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: "postgres",
    protocol: "postgres",
    logging: false,

    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },

    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },

    define: {
      freezeTableName: true,
      underscored: false,
      timestamps: true,
    },
  });
} else {
  // 💻 Local development DB
  const isSSL = process.env.DB_SSL === "true";

  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      dialect: "postgres",
      logging: false,

      dialectOptions: isSSL
        ? {
            ssl: {
              require: true,
              rejectUnauthorized: false,
            },
          }
        : {},

      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },

      define: {
        freezeTableName: true,
        underscored: false,
        timestamps: true,
      },
    }
  );
}

export default sequelize;