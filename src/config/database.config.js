import { Sequelize } from "sequelize";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

let sequelize;

// 🔥 PRIORITY: Check for DATABASE_URL (Render/Supabase or from .env)
const databaseUrl = process.env.DATABASE_URL || 
                    (process.env.DB_HOST ? null : undefined);

if (databaseUrl && databaseUrl.includes("postgresql://")) {
  // ✅ Using Supabase/PostgreSQL via DATABASE_URL
  console.log("📡 Connecting via DATABASE_URL (Supabase/PostgreSQL)");
  
  sequelize = new Sequelize(databaseUrl, {
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
} else if (process.env.DB_HOST) {
  // 💻 Using Local PostgreSQL (development)
  console.log("💻 Connecting to local database");
  
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
} else {
  throw new Error(
    "❌ DATABASE_URL or DB_HOST not set! Set DATABASE_URL for Render/Supabase or DB_HOST for local development"
  );
}

export default sequelize;
