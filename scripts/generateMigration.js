#!/usr/bin/env node

/**
 * MIGRATION GENERATOR
 * 
 * Quickly generate a new migration file with proper structure
 * Usage: node scripts/generateMigration.js "add-payment-status-to-bookings"
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../migrations");

const generateMigration = (description) => {
  if (!description) {
    console.error(
      "\n❌ Error: Please provide a migration description\n"
    );
    console.log("Usage: node scripts/generateMigration.js \"your-description\"\n");
    console.log("Example:");
    console.log('  node scripts/generateMigration.js "add-payment-status-to-bookings"\n');
    process.exit(1);
  }

  // Generate timestamp
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-T:.Z]/g, "")
    .slice(0, 14);

  // Create filename
  const filename = `${timestamp}-${description.toLowerCase().replace(/\s+/g, "-")}.js`;
  const filepath = path.join(migrationsDir, filename);

  // Check if file already exists
  if (fs.existsSync(filepath)) {
    console.error(`\n❌ Migration file already exists: ${filename}\n`);
    process.exit(1);
  }

  // Generate template
  const template = `/**
 * Migration: ${description}
 * 
 * Description: [Add your migration description here]
 * Date: ${now.toISOString().split("T")[0]}
 * 
 * Changes:
 * - [What this migration does]
 * - [Why this change is needed]
 */

export const up = async (queryInterface, Sequelize) => {
  try {
    console.log("🔄 Executing migration: ${description}");

    // TODO: Add your migration logic here
    // Examples:
    
    // Add a column:
    // await queryInterface.addColumn('table_name', 'column_name', {
    //   type: Sequelize.STRING,
    //   defaultValue: 'default_value',
    //   allowNull: false,
    // });

    // Create a table:
    // await queryInterface.createTable('new_table', {
    //   id: {
    //     type: Sequelize.UUID,
    //     primaryKey: true,
    //     defaultValue: Sequelize.literal('gen_random_uuid()'),
    //   },
    //   created_at: {
    //     type: Sequelize.DATE,
    //     defaultValue: Sequelize.NOW,
    //   },
    // });

    // Add an index:
    // await queryInterface.addIndex('table_name', ['column_name']);

    console.log("✅ Migration completed: ${description}");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    throw error;
  }
};

export const down = async (queryInterface, Sequelize) => {
  try {
    console.log("⏮️  Reverting migration: ${description}");

    // TODO: Add revert logic here
    // This should undo everything the up() function does
    
    // Examples:
    
    // Remove a column:
    // await queryInterface.removeColumn('table_name', 'column_name');

    // Drop a table:
    // await queryInterface.dropTable('new_table');

    console.log("✅ Migration reverted: ${description}");
  } catch (error) {
    console.error("❌ Revert failed:", error.message);
    throw error;
  }
};
`;

  // Create migration file
  fs.writeFileSync(filepath, template);

  console.log("\n" + "=".repeat(70));
  console.log("✅ MIGRATION FILE GENERATED");
  console.log("=".repeat(70));
  console.log(`\n📝 File created: ${filename}`);
  console.log(`📂 Location: migrations/${filename}`);
  console.log(`\n📋 Next steps:\n`);
  console.log(`   1. Open the file and add your migration logic`);
  console.log(`   2. Test locally: npm start`);
  console.log(`   3. Verify in SequelizeMeta table`);
  console.log(`   4. Commit and push\n`);
  console.log("=".repeat(70) + "\n");
};

// Get migration description from command line
const description = process.argv.slice(2).join(" ");
generateMigration(description);
