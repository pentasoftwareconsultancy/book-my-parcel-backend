/**
 * Spatial Index Migration
 *
 * Adds a PostGIS GIST index on traveller_routes.route_geom.
 *
 * WHY THIS IS CRITICAL:
 * Every parcel-matching cycle calls ST_DWithin() and ST_Distance() on
 * traveller_routes.route_geom (Methods D and E in matchingEngine.service.js).
 * Without a GIST index, PostgreSQL performs a full table scan on every call —
 * O(n) per query. With the index, it uses an R-tree spatial lookup — O(log n).
 *
 * Impact: 10x–100x speedup on matching queries as route count grows.
 *
 * NOTE: Sequelize's queryInterface.addIndex() does not support PostGIS GIST
 * index types, so we use sequelize.query() with raw SQL directly.
 * The ifNotExists guard (DO $$ ... $$) makes this migration safe to re-run.
 */

export const up = async (queryInterface, Sequelize) => {
  const sequelize = queryInterface.sequelize;

  // ── GIST index on route_geom ───────────────────────────────────────────────
  // Used by: ST_DWithin, ST_Distance in spatialMatching.service.js
  // Covers:  findRoutesWithinBuffer, findRoutesBetweenPoints, isPointNearRoute,
  //          estimateDetour, findRoutesByPlaceAndBuffer
  await sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'traveller_routes'
          AND indexname  = 'idx_traveller_routes_geom'
      ) THEN
        CREATE INDEX idx_traveller_routes_geom
          ON traveller_routes
          USING GIST (route_geom);
      END IF;
    END
    $$;
  `);

  console.log("✅ GIST spatial index created: idx_traveller_routes_geom on traveller_routes(route_geom)");

  // ── Supporting B-tree indexes on traveller_routes ──────────────────────────
  // These cover the WHERE clauses that run BEFORE the spatial filter,
  // further reducing the rows PostGIS needs to evaluate.

  // WHERE status = 'ACTIVE'  (all spatial queries filter by this first)
  await sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'traveller_routes'
          AND indexname  = 'idx_traveller_routes_status'
      ) THEN
        CREATE INDEX idx_traveller_routes_status
          ON traveller_routes (status);
      END IF;
    END
    $$;
  `);

  console.log("✅ B-tree index created: idx_traveller_routes_status on traveller_routes(status)");

  // WHERE traveller_profile_id = ?  (used in profile-based lookups)
  await sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'traveller_routes'
          AND indexname  = 'idx_traveller_routes_profile_id'
      ) THEN
        CREATE INDEX idx_traveller_routes_profile_id
          ON traveller_routes (traveller_profile_id);
      END IF;
    END
    $$;
  `);

  console.log("✅ B-tree index created: idx_traveller_routes_profile_id on traveller_routes(traveller_profile_id)");

  console.log("\n✅ All spatial indexes created successfully");
};

export const down = async (queryInterface) => {
  const sequelize = queryInterface.sequelize;

  await sequelize.query(`DROP INDEX IF EXISTS idx_traveller_routes_geom;`);
  await sequelize.query(`DROP INDEX IF EXISTS idx_traveller_routes_status;`);
  await sequelize.query(`DROP INDEX IF EXISTS idx_traveller_routes_profile_id;`);

  console.log("✅ Spatial indexes removed");
};
