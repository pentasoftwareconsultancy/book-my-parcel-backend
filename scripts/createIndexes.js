import sequelize from "../src/config/database.config.js";

const indexes = [
  // parcel table
  { table: "parcel", cols: ["user_id"],                                    name: "idx_parcels_user_id" },
  { table: "parcel", cols: ["user_id", "createdAt"],                       name: "idx_parcels_user_id_created" },
  { table: "parcel", cols: ["status"],                                     name: "idx_parcels_status" },
  { table: "parcel", cols: ["selected_partner_id"],                        name: "idx_parcels_selected_partner_id" },

  // booking table
  { table: "booking", cols: ["traveller_id"],                              name: "idx_bookings_traveller_id" },
  { table: "booking", cols: ["parcel_id"],                                 name: "idx_bookings_parcel_id" },
  { table: "booking", cols: ["status"],                                    name: "idx_bookings_status" },
  { table: "booking", cols: ["createdAt"],                                 name: "idx_bookings_created_at" },
  { table: "booking", cols: ["status", "createdAt"],                       name: "idx_bookings_status_created" },
  { table: "booking", cols: ["traveller_id", "status", "createdAt"],       name: "idx_bookings_traveller_status_created" },

  // parcel_request table
  { table: "parcel_requests", cols: ["traveller_id"],                      name: "idx_parcel_request_traveller_id" },
  { table: "parcel_requests", cols: ["parcel_id"],                         name: "idx_parcel_request_parcel_id" },
  { table: "parcel_requests", cols: ["status"],                            name: "idx_parcel_request_status" },
  { table: "parcel_requests", cols: ["traveller_id", "status"],            name: "idx_parcel_request_traveller_status" },

  // users table
  { table: "users", cols: ["createdAt"],                                   name: "idx_users_created_at" },
  { table: "users", cols: ["phone_number"],                                name: "idx_users_phone_number" },

  // user_roles table
  { table: "user_roles", cols: ["user_id"],                                name: "idx_user_roles_user_id" },
  { table: "user_roles", cols: ["role_id"],                                name: "idx_user_roles_role_id" },

  // traveller_kyc table
  { table: "traveller_kyc", cols: ["status"],                              name: "idx_traveller_kyc_status" },
  { table: "traveller_kyc", cols: ["user_id"],                             name: "idx_traveller_kyc_user_id" },
];

async function run() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database\n");

    let created = 0;
    let skipped = 0;
    let failed  = 0;

    for (const { table, cols, name } of indexes) {
      const colList = cols.map(c => `"${c}"`).join(", ");
      const sql = `CREATE INDEX IF NOT EXISTS "${name}" ON "${table}" (${colList})`;
      try {
        await sequelize.query(sql);
        console.log(`✅ ${name}`);
        created++;
      } catch (err) {
        console.error(`❌ ${name}: ${err.message}`);
        failed++;
      }
    }

    console.log(`\n─────────────────────────────`);
    console.log(`Created/verified : ${created}`);
    console.log(`Failed           : ${failed}`);

    // Verify parcel indexes
    console.log("\n📋 Verifying parcel indexes in DB:");
    const [rows] = await sequelize.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'parcel' ORDER BY indexname`
    );
    rows.forEach(r => console.log("  •", r.indexname));

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("Connection failed:", err.message);
    process.exit(1);
  }
}

run();
