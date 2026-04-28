import dotenv from "dotenv";
dotenv.config();
import sequelize from "../src/config/database.config.js";

const [tables] = await sequelize.query(
  `SELECT tablename FROM pg_tables
   WHERE schemaname = 'public'
   AND tablename IN ('chat_messages','delivery_attempts','referrals')`
);
console.log("Existing tables:", tables.map((t) => t.tablename));

const [cols] = await sequelize.query(
  `SELECT column_name FROM information_schema.columns
   WHERE table_name = 'user_profiles' AND column_name = 'referral_code'`
);
console.log("referral_code column:", cols.length ? "EXISTS" : "MISSING");

await sequelize.close();
