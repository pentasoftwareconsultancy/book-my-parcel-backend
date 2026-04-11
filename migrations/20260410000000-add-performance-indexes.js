/**
 * Performance Indexes Migration
 * Adds all missing indexes across the application for production-scale performance.
 * Run: node BMP-Backend/scripts/runMigrations.js
 */

export async function up(queryInterface) {

  // ── bookings ──────────────────────────────────────────────────────────────
  // traveller dashboard: WHERE traveller_id = ? ORDER BY createdAt DESC
  await queryInterface.addIndex("booking", ["traveller_id"], {
    name: "idx_bookings_traveller_id",
    ifNotExists: true,
  });

  // join from parcel side: WHERE parcel_id = ?
  await queryInterface.addIndex("booking", ["parcel_id"], {
    name: "idx_bookings_parcel_id",
    ifNotExists: true,
  });

  // status filter on booking list queries
  await queryInterface.addIndex("booking", ["status"], {
    name: "idx_bookings_status",
    ifNotExists: true,
  });

  // sort column used on every paginated booking query
  await queryInterface.addIndex("booking", ["createdAt"], {
    name: "idx_bookings_created_at",
    ifNotExists: true,
  });

  // composite: covers fetchTravellerDeliveries fully in one index
  // WHERE traveller_id = ? AND status IN (...) ORDER BY createdAt DESC
  await queryInterface.addIndex("booking", ["traveller_id", "status", "createdAt"], {
    name: "idx_bookings_traveller_status_created",
    ifNotExists: true,
  });

  // ── parcel ────────────────────────────────────────────────────────────────
  // getUserParcelRequests: WHERE user_id = ?
  await queryInterface.addIndex("parcel", ["user_id"], {
    name: "idx_parcels_user_id",
    ifNotExists: true,
  });

  // composite: covers WHERE user_id = ? ORDER BY createdAt DESC together
  await queryInterface.addIndex("parcel", ["user_id", "createdAt"], {
    name: "idx_parcels_user_id_created",
    ifNotExists: true,
  });

  // matching engine filters: WHERE status = 'CREATED' or 'MATCHING'
  await queryInterface.addIndex("parcel", ["status"], {
    name: "idx_parcels_status",
    ifNotExists: true,
  });

  // booking creation lookup
  await queryInterface.addIndex("parcel", ["selected_partner_id"], {
    name: "idx_parcels_selected_partner_id",
    ifNotExists: true,
  });

  // ── parcel_requests ───────────────────────────────────────────────────────
  // composite: fetchTravellerParcelRequests
  // WHERE traveller_id = ? AND status IN (...) ORDER BY created_at DESC
  await queryInterface.addIndex("parcel_requests", ["traveller_id", "status", "created_at"], {
    name: "idx_parcel_requests_traveller_status_created",
    ifNotExists: true,
  });

  // ── users ─────────────────────────────────────────────────────────────────
  // admin list: ORDER BY createdAt DESC
  await queryInterface.addIndex("users", ["createdAt"], {
    name: "idx_users_created_at",
    ifNotExists: true,
  });

  // OTP lookup + duplicate check
  await queryInterface.addIndex("users", ["phone_number"], {
    name: "idx_users_phone_number",
    ifNotExists: true,
  });

  // ── user_roles ────────────────────────────────────────────────────────────
  // admin getAllUsers EXISTS subquery: WHERE user_id = u.id
  await queryInterface.addIndex("user_roles", ["user_id"], {
    name: "idx_user_roles_user_id",
    ifNotExists: true,
  });

  // JOIN roles ON role_id
  await queryInterface.addIndex("user_roles", ["role_id"], {
    name: "idx_user_roles_role_id",
    ifNotExists: true,
  });

  // ── traveller_kyc ─────────────────────────────────────────────────────────
  // getTravelersForKYC: WHERE status = ?
  await queryInterface.addIndex("traveller_kyc", ["status"], {
    name: "idx_traveller_kyc_status",
    ifNotExists: true,
  });

  // JOIN users ON user_id
  await queryInterface.addIndex("traveller_kyc", ["user_id"], {
    name: "idx_traveller_kyc_user_id",
    ifNotExists: true,
  });

  // ORDER BY created_at DESC
  await queryInterface.addIndex("traveller_kyc", ["created_at"], {
    name: "idx_traveller_kyc_created_at",
    ifNotExists: true,
  });

  // ── notifications ─────────────────────────────────────────────────────────
  // Already defined in the model — listed here for completeness / documentation
  // (user_id, role), (user_id, is_read), (created_at)

  console.log("✅ All performance indexes created successfully");
}

export async function down(queryInterface) {
  const indexes = [
    // booking
    ["booking",         "idx_bookings_traveller_id"],
    ["booking",         "idx_bookings_parcel_id"],
    ["booking",         "idx_bookings_status"],
    ["booking",         "idx_bookings_created_at"],
    ["booking",         "idx_bookings_traveller_status_created"],
    // parcel
    ["parcel",          "idx_parcels_user_id"],
    ["parcel",          "idx_parcels_user_id_created"],
    ["parcel",          "idx_parcels_status"],
    ["parcel",          "idx_parcels_selected_partner_id"],
    // parcel_requests
    ["parcel_requests", "idx_parcel_requests_traveller_status_created"],
    // users
    ["users",           "idx_users_created_at"],
    ["users",           "idx_users_phone_number"],
    // user_roles
    ["user_roles",      "idx_user_roles_user_id"],
    ["user_roles",      "idx_user_roles_role_id"],
    // traveller_kyc
    ["traveller_kyc",   "idx_traveller_kyc_status"],
    ["traveller_kyc",   "idx_traveller_kyc_user_id"],
    ["traveller_kyc",   "idx_traveller_kyc_created_at"],
  ];

  for (const [table, name] of indexes) {
    try {
      await queryInterface.removeIndex(table, name);
    } catch (err) {
      console.warn(`Could not remove index ${name} on ${table}:`, err.message);
    }
  }

  console.log("✅ All performance indexes removed");
}
