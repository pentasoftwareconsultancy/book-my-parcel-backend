#!/usr/bin/env node

/**
 * MIGRATION STATUS CHECKER
 * 
 * Run this script to check migration status in any environment:
 * node scripts/checkMigrationStatus.js
 * 
 * Useful for debugging migration issues
 */

import dotenv from "dotenv";
dotenv.config();
import { Sequelize } from "sequelize";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../backend/migrations");

const checkMigrationStatus = async () => {
  let sequelize;

  try {
    console.log("\n" + "=".repeat(70));
    console.log("📊 MIGRATION STATUS CHECKER");
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

    console.log(`📂 Total migration files found: ${migrationFiles.length}\n`);

    // Check if SequelizeMeta table exists
    const [metaExists] = await sequelize.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'SequelizeMeta'
      )
    `);

    if (!metaExists[0].exists) {
      console.log("⚠️  SequelizeMeta table does NOT exist yet");
      console.log("   (It will be created on next server start)\n");
    } else {
      console.log("✅ SequelizeMeta table exists\n");

      // Get executed migrations
      const [executedMigrations] = await sequelize.query(
        `SELECT name, executed_at FROM "SequelizeMeta" ORDER BY name ASC`
      );

      console.log(`📋 EXECUTED MIGRATIONS (${executedMigrations.length}):\n`);

      if (executedMigrations.length === 0) {
        console.log("   (No migrations executed yet)\n");
      } else {
        executedMigrations.forEach((m, idx) => {
          const date = new Date(m.executed_at).toLocaleString();
          console.log(
            `   ${String(idx + 1).padStart(2, " ")}. ${m.name}`
          );
          console.log(`       ✅ Executed at: ${date}`);
        });
        console.log();
      }

      // Find pending migrations
      const executedNames = executedMigrations.map((m) => m.name);
      const pendingMigrations = migrationFiles.filter(
        (file) => !executedNames.includes(file)
      );

      console.log(`⏳ PENDING MIGRATIONS (${pendingMigrations.length}):\n`);

      if (pendingMigrations.length === 0) {
        console.log("   ✅ All migrations are up-to-date!\n");
      } else {
        pendingMigrations.forEach((m, idx) => {
          console.log(`   ${String(idx + 1).padStart(2, " ")}. ${m}`);
        });
        console.log();
      }
    }

    // Check table counts and sizes
    console.log("📊 DATABASE TABLES:\n");

    const [tables] = await sequelize.query(`
      SELECT 
        tablename,
        (SELECT count(*) FROM information_schema.columns WHERE table_name = tablename) as column_count
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);

    if (tables.length === 0) {
      console.log("   (No tables found)\n");
    } else {
      tables.forEach((t) => {
        console.log(`   📋 ${t.tablename} (${t.column_count} columns)`);
      });
      console.log();
    }

    // Final Summary
    console.log("=".repeat(70));
    console.log("✅ MIGRATION STATUS CHECK COMPLETE");
    console.log("=".repeat(70) + "\n");

    console.log("📝 NEXT STEPS:\n");

    if (!metaExists[0].exists) {
      console.log(
        "   • Start the server to create SequelizeMeta and run migrations"
      );
      console.log("   • Run: npm start\n");
    } else if (pendingMigrations.length > 0) {
      console.log(
        `   • ${pendingMigrations.length} migrations are pending`
      );
      console.log("   • Start the server to execute them");
      console.log("   • Run: npm start\n");
    } else {
      console.log(
        "   • Database schema is up-to-date!"
      );
      console.log(
        "   • All migrations have been executed successfully\n"
      );
    }
  } catch (error) {
    console.error("\n❌ Error checking migration status:");
    console.error(`   ${error.message}\n`);
    process.exit(1);
  } finally {
    if (sequelize) {
      await sequelize.close();
    }
  }
};

checkMigrationStatus();
