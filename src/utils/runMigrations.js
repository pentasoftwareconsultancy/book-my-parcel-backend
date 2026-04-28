import { Sequelize } from "sequelize";
import sequelize from "../config/database.config.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../migrations");

/**
 * COMPREHENSIVE MIGRATION RUNNER
 * 
 * This script automatically runs all pending database migrations on server startup.
 * Features:
 * ✅ Tracks executed migrations in SequelizeMeta table
 * ✅ Runs only pending migrations (never repeats executed ones)
 * ✅ Works in all environments (local, GitHub Actions, Render)
 * ✅ Logs all changes with clear messages
 * ✅ Handles errors gracefully
 * ✅ Shows NEW COLUMNS ADDED in console
 */

const runMigrations = async () => {
  try {
    console.log("\n" + "=".repeat(70));
    console.log("🔧 DATABASE MIGRATION RUNNER - INITIALIZING");
    console.log("=".repeat(70));

    // Get all migration files sorted by timestamp
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter(
        (file) =>
          file.endsWith(".js") &&
          !file.includes("migrate") &&
          !file.includes(".sql")
      )
      .sort();

    console.log(`📂 Found ${migrationFiles.length} migration files`);

    if (migrationFiles.length === 0) {
      console.log("✅ No migrations to run\n");
      return;
    }

    // Ensure SequelizeMeta table exists to track executed migrations
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
        name VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of already executed migrations
    const [executedMigrations] = await sequelize.query(
      `SELECT name FROM "SequelizeMeta" ORDER BY name ASC`
    );
    const executedNames = executedMigrations.map((row) => row.name);

    console.log(`📋 Already executed: ${executedNames.length} migrations`);
    if (executedNames.length > 0) {
      console.log(`   └─ Latest: ${executedNames[executedNames.length - 1]}`);
    }

    // Find pending migrations
    const pendingMigrations = migrationFiles.filter(
      (file) => !executedNames.includes(file)
    );

    if (pendingMigrations.length === 0) {
      console.log("✅ All migrations already executed. Database is up-to-date!\n");
      return;
    }

    console.log(
      `\n⚙️  RUNNING ${pendingMigrations.length} PENDING MIGRATIONS\n`
    );

    // Run each pending migration
    for (const migrationFile of pendingMigrations) {
      const migrationPath = path.join(migrationsDir, migrationFile);

      try {
        console.log(`📝 Executing: ${migrationFile}`);

        // Dynamically import the migration
        const migration = await import(`file://${migrationPath}`);

        if (!migration.up) {
          throw new Error(`❌ Migration ${migrationFile} has no 'up' function`);
        }

        // Run the migration's up function
        await migration.up(sequelize.getQueryInterface(), Sequelize);

        // Mark as executed
        await sequelize.query(
          `INSERT INTO "SequelizeMeta" (name) VALUES (:name)`,
          {
            replacements: { name: migrationFile },
            type: sequelize.QueryTypes.INSERT,
          }
        );

        console.log(
          `   ✅ SUCCESS - ${migrationFile}`
        );

        // Extract and display what was added
        const migrationContent = fs.readFileSync(migrationPath, "utf-8");
        const columnsAdded = extractColumnsAdded(migrationContent);
        const tablesCreated = extractTablesCreated(migrationContent);

        if (columnsAdded.length > 0) {
          console.log(`   📊 NEW COLUMNS ADDED:`);
          columnsAdded.forEach((col) => {
            console.log(`       • ${col.table}.${col.column} (${col.type})`);
          });
        }

        if (tablesCreated.length > 0) {
          console.log(`   📋 NEW TABLES CREATED:`);
          tablesCreated.forEach((table) => {
            console.log(`       • ${table}`);
          });
        }
      } catch (error) {
        // Handle "already exists" errors gracefully
        const isAlreadyExists =
          error.message?.includes("already exists") ||
          error.original?.message?.includes("already exists") ||
          error.parent?.message?.includes("already exists");

        if (isAlreadyExists) {
          console.warn(
            `   ⚠️  SKIPPED (Already Exists): ${migrationFile}`
          );
          console.warn(`   ℹ️  This is normal if the database was set up before migration tracking`);

          // Still mark as executed to prevent re-running
          try {
            await sequelize.query(
              `INSERT INTO "SequelizeMeta" (name) VALUES (:name)`,
              {
                replacements: { name: migrationFile },
                type: sequelize.QueryTypes.INSERT,
              }
            );
            console.warn(`   ✅ Marked as executed to prevent re-running\n`);
          } catch (insertError) {
            // Already marked, that's ok
            console.warn(`   ✅ Already tracked in SequelizeMeta\n`);
          }
        } else {
          // Real error - throw it
          console.error(
            `\n❌ MIGRATION FAILED: ${migrationFile}`
          );
          console.error(`   Error: ${error.message}\n`);
          throw error;
        }
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log("✅ ALL MIGRATIONS COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(70) + "\n");
  } catch (error) {
    console.error("\n" + "=".repeat(70));
    console.error("❌ MIGRATION RUNNER FAILED!");
    console.error("=".repeat(70));
    console.error("Error Details:", error.message);
    console.error("=".repeat(70) + "\n");
    throw error;
  }
};

/**
 * Extract column additions from migration content
 */
const extractColumnsAdded = (content) => {
  const columns = [];
  const regex =
    /await queryInterface\.addColumn\s*\(\s*['"]([\w]+)['"]\s*,\s*['"]([\w]+)['"]\s*,\s*\{[\s\S]*?type:\s*Sequelize\.(\w+)/g;

  let match;
  while ((match = regex.exec(content)) !== null) {
    columns.push({
      table: match[1],
      column: match[2],
      type: match[3],
    });
  }
  return columns;
};

/**
 * Extract table creations from migration content
 */
const extractTablesCreated = (content) => {
  const tables = [];
  const regex =
    /await queryInterface\.createTable\s*\(\s*['"]([\w]+)['"]\s*,/g;

  let match;
  while ((match = regex.exec(content)) !== null) {
    tables.push(match[1]);
  }
  return tables;
};

export default runMigrations;
