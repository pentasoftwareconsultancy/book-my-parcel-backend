#!/usr/bin/env node

/**
 * MIGRATION RECOVERY TOOL
 * 
 * Handles cases where database schema was created before migration tracking
 * Usage: node scripts/recoverMigrations.js
 * 
 * This script:
 * 1. Checks which migrations have already run in the database
 * 2. Checks which migrations are tracked in SequelizeMeta
 * 3. Marks old migrations as executed to prevent re-running
 */

import dotenv from "dotenv";
dotenv.config();
import { Sequelize } from "sequelize";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../migrations");

const recoverMigrations = async () => {
  let sequelize;

  try {
    console.log("\n" + "=".repeat(70));
    console.log("🔧 MIGRATION RECOVERY TOOL");
    console.log("=".repeat(70) + "\n");

    // Create database connection
    if (process.env.DATABASE_URL) {
      console.log("🌐 Using: Render/Cloud PostgreSQL");
      sequelize = new Sequelize(process.env.DATABASE_URL, {
        dialect: "postgres",
        logging: false,
        dialectOptions: {
          ssl: { require: true, rejectUnauthorized: false },
        },
      });
    } else {
      console.log("💻 Using: Local PostgreSQL");
      sequelize = new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASSWORD,
        {
          host: process.env.DB_HOST,
          port: process.env.DB_PORT || 5432,
          dialect: "postgres",
          logging: false,
        }
      );
    }

    await sequelize.authenticate();
    console.log("✅ Database connected\n");

    // Create SequelizeMeta table if needed
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
        name VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get all migration files
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter(
        (file) =>
          file.endsWith(".js") &&
          !file.includes("migrate") &&
          !file.includes(".sql")
      )
      .sort();

    console.log(`📂 Found ${migrationFiles.length} migration files\n`);

    // Get executed migrations
    const [executedMigrations] = await sequelize.query(
      `SELECT name FROM "SequelizeMeta" ORDER BY name ASC`
    );
    const executedNames = executedMigrations.map((m) => m.name);

    console.log(`📋 Already tracked: ${executedNames.length} migrations`);
    if (executedNames.length > 0) {
      console.log(`   └─ Latest: ${executedNames[executedNames.length - 1]}`);
    }

    // Find untracked migrations
    const untrackedMigrations = migrationFiles.filter(
      (file) => !executedNames.includes(file)
    );

    if (untrackedMigrations.length === 0) {
      console.log("\n✅ All migrations are tracked. No recovery needed.\n");
      await sequelize.close();
      return;
    }

    console.log(
      `\n⚠️  Found ${untrackedMigrations.length} untracked migrations`
    );
    console.log("These may have been run manually before migration tracking was added.\n");

    // Mark old migrations as executed
    console.log("📝 Marking untracked migrations as executed...\n");

    let markedCount = 0;
    for (const migrationFile of untrackedMigrations) {
      try {
        await sequelize.query(
          `INSERT INTO "SequelizeMeta" (name) VALUES (:name)`,
          {
            replacements: { name: migrationFile },
            type: sequelize.QueryTypes.INSERT,
          }
        );
        console.log(`   ✅ Marked: ${migrationFile}`);
        markedCount++;
      } catch (error) {
        if (error.message?.includes("duplicate key")) {
          console.log(`   ℹ️  Already tracked: ${migrationFile}`);
        } else {
          console.error(`   ❌ Error marking ${migrationFile}: ${error.message}`);
        }
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log(`✅ MIGRATION RECOVERY COMPLETE`);
    console.log(`   Marked ${markedCount} migrations as executed`);
    console.log("=".repeat(70) + "\n");

    console.log("📝 Next steps:");
    console.log("   1. Run: npm start");
    console.log("   2. Migrations should now run without 'already exists' errors");
    console.log("   3. New migrations will be tracked and won't be re-run\n");

    await sequelize.close();
  } catch (error) {
    console.error("\n❌ Recovery failed:");
    console.error(`   ${error.message}\n`);
    process.exit(1);
  } finally {
    if (sequelize) {
      await sequelize.close();
    }
  }
};

recoverMigrations();
