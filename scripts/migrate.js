/**
 * Standalone migration runner.
 * Usage:
 *   node scripts/migrate.js              → runs all pending migrations
 *   node scripts/migrate.js --down       → rolls back the last migration
 *   node scripts/migrate.js <filename>   → runs a specific migration file
 *
 * Example:
 *   node scripts/migrate.js 20260420000000-add-phase3-phase4-tables.js
 */

import dotenv from "dotenv";
dotenv.config();

import { Sequelize, DataTypes } from "sequelize";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "../migrations");

// ── Build Sequelize instance from env ────────────────────────────────────────
let sequelize;

if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: "postgres",
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host:    process.env.DB_HOST     || "localhost",
      port:    process.env.DB_PORT     || 5432,
      dialect: "postgres",
      logging: false,
      dialectOptions: process.env.DB_SSL === "true"
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : {},
    }
  );
}

// ── Migration tracking table ──────────────────────────────────────────────────
const MigrationModel = sequelize.define(
  "sequelize_migrations",
  {
    name:       { type: DataTypes.STRING, primaryKey: true },
    run_at:     { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { timestamps: false, freezeTableName: true }
);

async function ensureMigrationTable() {
  await MigrationModel.sync({ force: false });
}

async function getApplied() {
  const rows = await MigrationModel.findAll({ attributes: ["name"] });
  return new Set(rows.map((r) => r.name));
}

async function markApplied(name) {
  await MigrationModel.create({ name });
}

async function markReverted(name) {
  await MigrationModel.destroy({ where: { name } });
}

// ── Run migrations ────────────────────────────────────────────────────────────
async function runMigrations(targetFile = null) {
  await sequelize.authenticate();
  console.log("✅ Connected to database\n");
  await ensureMigrationTable();

  const applied = await getApplied();

  // Get migration files
  let files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".js") && !f.startsWith("migrate-") && !f.startsWith("phase"))
    .sort();

  if (targetFile) {
    files = files.filter((f) => f === targetFile || f.includes(targetFile));
    if (files.length === 0) {
      console.error(`❌ No migration file matching: ${targetFile}`);
      process.exit(1);
    }
  } else {
    files = files.filter((f) => !applied.has(f));
  }

  if (files.length === 0) {
    console.log("✅ No pending migrations.");
    return;
  }

  console.log(`Running ${files.length} migration(s):\n`);

  for (const file of files) {
    if (applied.has(file) && !targetFile) {
      console.log(`  ⏭  Skipping (already applied): ${file}`);
      continue;
    }

    const filePath = pathToFileURL(path.join(MIGRATIONS_DIR, file)).href;
    const migration = await import(filePath);

    // Support both:
    //   export async function up() {}   → migration.up
    //   export default { up, down }     → migration.default.up
    const up   = migration.up   ?? migration.default?.up;
    const down = migration.down ?? migration.default?.down;

    if (typeof up !== "function") {
      console.error(`  ❌ Skipping ${file}: no up() function found`);
      continue;
    }

    try {
      console.log(`  ▶  Running: ${file}`);
      await up(sequelize.getQueryInterface(), Sequelize);
      await markApplied(file);
      console.log(`  ✅ Done: ${file}\n`);
    } catch (err) {
      // "already exists" errors are safe to ignore — table/index was created by sequelize.sync
      if (err.message.includes("already exists")) {
        console.log(`  ⚠️  Skipped (already exists): ${file}\n`);
        await markApplied(file).catch(() => {}); // mark as applied so it's not retried
      } else {
        console.error(`  ❌ Failed: ${file}`);
        console.error(`     ${err.message}\n`);
      }
    }
  }
}

async function rollbackLast() {
  await sequelize.authenticate();
  await ensureMigrationTable();

  const applied = await getApplied();
  if (applied.size === 0) {
    console.log("Nothing to roll back.");
    return;
  }

  // Last applied = highest sort order
  const last = [...applied].sort().pop();
  const filePath = pathToFileURL(path.join(MIGRATIONS_DIR, last)).href;

  try {
    const migration = await import(filePath);
    const down = migration.down ?? migration.default?.down;
    if (typeof down !== "function") {
      console.error(`  ❌ No down() function in ${last}`);
      return;
    }
    console.log(`  ▶  Rolling back: ${last}`);
    await down(sequelize.getQueryInterface(), Sequelize);
    await markReverted(last);
    console.log(`  ✅ Rolled back: ${last}`);
  } catch (err) {
    console.error(`  ❌ Rollback failed: ${err.message}`);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

try {
  if (args.includes("--down")) {
    await rollbackLast();
  } else {
    const target = args.find((a) => !a.startsWith("--"));
    await runMigrations(target || null);
  }
} catch (err) {
  console.error("Migration runner error:", err.message);
  process.exit(1);
} finally {
  await sequelize.close();
}
