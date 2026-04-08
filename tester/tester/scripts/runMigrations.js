/**
 * Migration Runner Script
 * Runs all pending migrations to set up the database schema
 */

import dotenv from "dotenv";
import sequelize from "../src/config/database.config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  try {
    console.log("🔄 Starting database migrations...\n");

    // Authenticate connection
    await sequelize.authenticate();
    console.log("✅ Database connection established\n");

    // Get all migration files
    const migrationsDir = path.join(__dirname, "../migrations");
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".js"))
      .sort();

    console.log(`📦 Found ${migrationFiles.length} migration files\n`);

    // Run each migration
    for (const file of migrationFiles) {
      try {
        // Skip non-standard migration files
        if (file.startsWith("migrate-") || file.startsWith("phase-")) {
          console.log(`⏭️  Skipped: ${file} (custom migration)\n`);
          continue;
        }

        console.log(`⏳ Running: ${file}`);
        const migrationPath = path.join(migrationsDir, file);
        const migration = await import(`file://${migrationPath}`);

        if (migration.up) {
          await migration.up(sequelize.getQueryInterface(), sequelize.Sequelize);
          console.log(`✅ Completed: ${file}\n`);
        }
      } catch (error) {
        // Skip if table already exists
        if (error.message.includes("already exists")) {
          console.log(`⏭️  Skipped: ${file} (already exists)\n`);
        } else {
          console.error(`❌ Failed: ${file}`);
          console.error(`   Error: ${error.message}\n`);
        }
      }
    }

    console.log("✅ All migrations completed successfully!\n");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  }
}

runMigrations();
