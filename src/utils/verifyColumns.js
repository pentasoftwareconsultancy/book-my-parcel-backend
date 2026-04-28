import sequelize from "../config/database.config.js";

/**
 * COLUMN VERIFICATION & AUTO-ADD UTILITY
 * 
 * This is a backup mechanism that checks if columns exist in tables
 * and adds them if they're missing (without removing data).
 * 
 * Useful for emergency fixes if a migration somehow failed.
 */

const verifyAndAddMissingColumns = async () => {
  try {
    console.log("\n" + "=".repeat(70));
    console.log("🔍 COLUMN VERIFICATION - CHECKING FOR MISSING COLUMNS");
    console.log("=".repeat(70) + "\n");

    const queryInterface = sequelize.getQueryInterface();

    // Define all required columns for each table
    // Format: { tableName: { columnName: sqlDataType } }
    const requiredColumns = {
      traveller_profiles: {
        rating: "DECIMAL(2,1)",
        total_deliveries: "INTEGER",
        profile_photo: "VARCHAR(255)",
        location: "GEOMETRY",
      },
      booking: {
        otp: "VARCHAR(6)",
        otp_verified: "BOOLEAN",
        otp_attempts: "INTEGER",
        otp_expires_at: "TIMESTAMP",
        payment_mode: "VARCHAR(50)",
        user_id: "UUID",
        amount: "DECIMAL(10,2)",
        booking_tracking_status: "VARCHAR(50)",
        booking_current_location: "GEOMETRY",
        transport_mode: "VARCHAR(50)",
      },
      traveller_routes: {
        transit_details: "TEXT",
        transport_mode: "VARCHAR(50)",
      },
      parcel_request: {
        interested_status: "VARCHAR(50)",
        partner_selected_status: "BOOLEAN",
      },
      route_places: {
        sequence_order: "INTEGER",
      },
      parcels: {
        form_step: "INTEGER",
      },
      feedbacks: {
        tags: "JSONB",
      },
    };

    let totalMissing = 0;
    const addedColumns = [];

    // Check each table
    for (const [tableName, columns] of Object.entries(requiredColumns)) {
      try {
        // Check if table exists
        const tableExists = await sequelize.query(
          `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${tableName}')`
        );

        if (!tableExists[0][0].exists) {
          console.log(`⚠️  Table "${tableName}" does not exist yet (will be created by sync)`);
          continue;
        }

        // Check each column in the table
        for (const [columnName, columnType] of Object.entries(columns)) {
          const columnExists = await sequelize.query(
            `SELECT EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = '${tableName}' AND column_name = '${columnName}')`
          );

          if (!columnExists[0][0].exists) {
            console.log(
              `❌ MISSING: ${tableName}.${columnName} (${columnType})`
            );
            totalMissing++;

            // Attempt to add the column with a safe default
            try {
              const defaultValue =
                columnType.includes("INTEGER") ? "0" :
                columnType.includes("BOOLEAN") ? "false" :
                columnType.includes("DECIMAL") ? "0.0" :
                columnType.includes("TIMESTAMP") ? "CURRENT_TIMESTAMP" :
                "NULL";

              await sequelize.query(
                `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${columnType} DEFAULT ${defaultValue}`
              );

              addedColumns.push(`${tableName}.${columnName}`);
              console.log(
                `   ✅ ADDED: ${tableName}.${columnName} with DEFAULT ${defaultValue}`
              );
            } catch (addError) {
              console.error(
                `   ⚠️  Could not auto-add column. Manual intervention needed.`
              );
              console.error(`   Error: ${addError.message}`);
            }
          }
        }
      } catch (tableError) {
        console.error(`Error checking table ${tableName}:`, tableError.message);
      }
    }

    console.log("\n" + "=".repeat(70));
    if (totalMissing === 0) {
      console.log("✅ ALL COLUMNS VERIFIED - DATABASE SCHEMA IS UP-TO-DATE!");
    } else {
      console.log(`⚠️  Found ${totalMissing} missing columns`);
      if (addedColumns.length > 0) {
        console.log(
          `✅ Successfully added ${addedColumns.length} missing columns:`
        );
        addedColumns.forEach((col) => console.log(`   • ${col}`));
      }
    }
    console.log("=".repeat(70) + "\n");
  } catch (error) {
    console.error("Column verification error:", error.message);
    // Don't throw - this is a safety check, not critical
  }
};

export default verifyAndAddMissingColumns;
