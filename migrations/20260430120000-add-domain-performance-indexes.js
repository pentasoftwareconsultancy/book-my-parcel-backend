const indexes = [
  ["payments", ["parcel_id"], "idx_payments_parcel_id"],
  ["payments", ["booking_id"], "idx_payments_booking_id"],
  ["payments", ["status"], "idx_payments_status"],
  ["payments", ["createdAt"], "idx_payments_created_at"],
  ["payments", ["parcel_id", "status"], "idx_payments_parcel_status"],
  ["payments", ["status", "released_at"], "idx_payments_status_released_at"],
  ["payments", ["razorpay_order_id"], "idx_payments_razorpay_order_id"],
  ["payments", ["razorpay_payment_id"], "idx_payments_razorpay_payment_id"],

  ["wallet_transactions", ["wallet_id"], "idx_wallet_transactions_wallet_id"],
  ["wallet_transactions", ["wallet_id", "createdAt"], "idx_wallet_transactions_wallet_created"],

  ["withdrawals", ["user_id"], "idx_withdrawals_user_id"],
  ["withdrawals", ["status"], "idx_withdrawals_status"],
  ["withdrawals", ["requested_at"], "idx_withdrawals_requested_at"],
  ["withdrawals", ["user_id", "requested_at"], "idx_withdrawals_user_requested"],

  ["parcel_trackings", ["booking_id"], "idx_parcel_trackings_booking_id"],
  ["parcel_trackings", ["status"], "idx_parcel_trackings_status"],

  ["pending_payment", ["booking_id"], "idx_pending_payments_booking_id"],
  ["pending_payment", ["traveller_id"], "idx_pending_payments_traveller_id"],
  ["pending_payment", ["status"], "idx_pending_payments_status"],
  ["pending_payment", ["delivery_ref"], "idx_pending_payments_delivery_ref"],
  ["pending_payment", ["traveller_id", "status", "createdAt"], "idx_pending_payments_traveller_status_created"],

  ["traveller_profiles", ["user_id"], "idx_traveller_profiles_user_id"],
  ["traveller_profiles", ["status"], "idx_traveller_profiles_status"],
  ["traveller_profiles", ["is_available"], "idx_traveller_profiles_available"],
  ["traveller_profiles", ["status", "is_available"], "idx_traveller_profiles_status_available"],

  ["traveller_routes", ["traveller_profile_id"], "idx_traveller_routes_profile_id"],
  ["traveller_routes", ["origin_address_id"], "idx_traveller_routes_origin_address_id"],
  ["traveller_routes", ["dest_address_id"], "idx_traveller_routes_dest_address_id"],
  ["traveller_routes", ["status"], "idx_traveller_routes_status"],
  ["traveller_routes", ["departure_date"], "idx_traveller_routes_departure_date"],
  ["traveller_routes", ["vehicle_type"], "idx_traveller_routes_vehicle_type"],
  ["traveller_routes", ["available_capacity_kg"], "idx_traveller_routes_capacity"],
  ["traveller_routes", ["traveller_profile_id", "created_at"], "idx_traveller_routes_profile_created"],
  ["traveller_routes", ["status", "available_capacity_kg"], "idx_traveller_routes_status_capacity"],

  ["route_places", ["route_id"], "idx_route_places_route_id"],
  ["route_places", ["place_type", "place_id"], "idx_route_places_place_type_place_id"],
  ["route_places", ["route_id", "sequence_order"], "idx_route_places_route_sequence"],

  ["refunds", ["payment_id"], "idx_refunds_payment_id"],
  ["refunds", ["status"], "idx_refunds_status"],

  ["disputes", ["booking_id"], "idx_disputes_booking_id"],
  ["disputes", ["raised_by"], "idx_disputes_raised_by"],
  ["disputes", ["status"], "idx_disputes_status"],
  ["disputes", ["created_at"], "idx_disputes_created_at"],
  ["disputes", ["booking_id", "raised_by"], "idx_disputes_booking_raised_by"],

  ["user_profiles", ["user_id"], "idx_user_profiles_user_id"],
  ["user_profiles", ["city"], "idx_user_profiles_city"],
  ["user_profiles", ["pincode"], "idx_user_profiles_pincode"],

  ["roles", ["name"], "idx_roles_name"],
  ["user_roles", ["user_id", "role_id"], "idx_user_roles_user_role"],

  ["booking_status_logs", ["booking_id"], "idx_booking_status_logs_booking_id"],
  ["booking_status_logs", ["booking_id", "createdAt"], "idx_booking_status_logs_booking_created"],
  ["booking_status_logs", ["status"], "idx_booking_status_logs_status"],

  ["parcel_proofs", ["booking_id"], "idx_parcel_proofs_booking_id"],
  ["parcel_proofs", ["booking_id", "type"], "idx_parcel_proofs_booking_type"],

  ["chat_messages", ["booking_id", "createdAt"], "idx_chat_booking_created"],
  ["chat_messages", ["booking_id", "is_read"], "idx_chat_booking_read"],

  ["delivery_attempts", ["traveller_id"], "idx_delivery_attempts_traveller_id"],
  ["delivery_attempts", ["booking_id", "attempted_at"], "idx_delivery_attempts_booking_attempted"],

  ["aadhaar_verifications", ["traveller_id"], "idx_aadhaar_verifications_traveller_id"],
  ["aadhaar_verifications", ["status"], "idx_aadhaar_verifications_status"],
  ["aadhaar_verifications", ["verified_by"], "idx_aadhaar_verifications_verified_by"],

  ["traveller_trips", ["traveller_id"], "idx_traveller_trips_traveller_id"],
  ["traveller_trips", ["status"], "idx_traveller_trips_status"],
  ["traveller_trips", ["source_city", "destination_city", "status"], "idx_traveller_trips_city_status"],
];

async function describeTableSafe(queryInterface, tableName) {
  try {
    return await queryInterface.describeTable(tableName);
  } catch {
    return null;
  }
}

function hasColumns(tableDescription, columns) {
  return columns.every((column) => tableDescription?.[column]);
}

export const up = async (queryInterface) => {
  const tableCache = new Map();

  for (const [tableName, fields, indexName] of indexes) {
    if (!tableCache.has(tableName)) {
      tableCache.set(tableName, await describeTableSafe(queryInterface, tableName));
    }

    const tableDescription = tableCache.get(tableName);
    if (!hasColumns(tableDescription, fields)) {
      console.warn(`Skipping ${indexName}: ${tableName} missing one of [${fields.join(", ")}]`);
      continue;
    }

    await queryInterface.addIndex(tableName, fields, {
      name: indexName,
      ifNotExists: true,
    });
  }

  const travellerRoutes = tableCache.get("traveller_routes")
    || await describeTableSafe(queryInterface, "traveller_routes");
  if (travellerRoutes?.route_geom) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_traveller_routes_route_geom
      ON traveller_routes
      USING GIST (route_geom)
    `);
  }

  const travellerProfiles = tableCache.get("traveller_profiles")
    || await describeTableSafe(queryInterface, "traveller_profiles");
  if (travellerProfiles?.last_known_location) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_traveller_profiles_last_known_location
      ON traveller_profiles
      USING GIST (last_known_location)
    `);
  }
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query("DROP INDEX IF EXISTS idx_traveller_profiles_last_known_location");
  await queryInterface.sequelize.query("DROP INDEX IF EXISTS idx_traveller_routes_route_geom");

  for (const [tableName, , indexName] of [...indexes].reverse()) {
    try {
      await queryInterface.removeIndex(tableName, indexName);
    } catch (error) {
      console.warn(`Could not remove index ${indexName} on ${tableName}: ${error.message}`);
    }
  }
};
