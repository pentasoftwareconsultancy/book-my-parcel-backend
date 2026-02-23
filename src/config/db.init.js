import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  DB_SSL,
} = process.env;

const initDatabase = async () => {
  if (process.env.DATABASE_URL) {
    console.log("Skipping database creation (managed DB)");
    return;
  }

  const sequelize = new Sequelize("postgres", DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    port: DB_PORT || 5432,
    dialect: "postgres",
    logging: false,

    dialectOptions:
      DB_SSL === "true"
        ? {
            ssl: {
              require: true,
              rejectUnauthorized: false, // needed for Render/Heroku
            },
          }
        : {},
  });

  try {
    await sequelize.authenticate();

    const [result] = await sequelize.query(
      `SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'`
    );

    if (result.length === 0) {
      await sequelize.query(`CREATE DATABASE "${DB_NAME}"`);
      console.log(`Database "${DB_NAME}" created`);
    } else {
      console.log(`Database "${DB_NAME}" already exists`);
    }

    await sequelize.close();
  } catch (error) {
    console.error("Database initialization failed:", error);
    process.exit(1);
  }
};

export default initDatabase;