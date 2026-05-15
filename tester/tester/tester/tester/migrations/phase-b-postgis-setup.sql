-- ============================================================================
-- Phase B: PostGIS Setup & Spatial Indexing
-- ============================================================================
-- This script enables PostGIS and adds spatial geometry support to the database
-- Date: March 14, 2026
-- ============================================================================

-- Step 1: Enable PostGIS Extension
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Verify PostGIS installation
SELECT postgis_version();

-- ============================================================================
-- Step 2: Add Geometry Column to traveller_routes
-- ============================================================================
-- This column stores the route as a LINESTRING (series of coordinates)
-- SRID 4326 = WGS84 (latitude/longitude)

ALTER TABLE traveller_routes 
ADD COLUMN IF NOT EXISTS route_geom geometry(LineString, 4326);

-- Add comment for documentation
COMMENT ON COLUMN traveller_routes.route_geom IS 
'Route geometry as LINESTRING (decoded from Google Routes API polyline). SRID 4326 = WGS84';

-- ============================================================================
-- Step 3: Create Spatial Indexes
-- ============================================================================
-- GiST (Generalized Search Tree) index for fast spatial queries

-- Index on route geometry for spatial queries
CREATE INDEX IF NOT EXISTS idx_traveller_routes_geom 
ON traveller_routes USING GIST (route_geom);

-- Index on route_geom with route_id for combined queries
CREATE INDEX IF NOT EXISTS idx_traveller_routes_geom_route_id 
ON traveller_routes USING GIST (route_geom) 
WHERE status = 'ACTIVE';

-- ============================================================================
-- Step 4: Add Helper Columns (Optional but Useful)
-- ============================================================================
-- These columns cache commonly used values for performance

ALTER TABLE traveller_routes 
ADD COLUMN IF NOT EXISTS route_bounds box2d;

COMMENT ON COLUMN traveller_routes.route_bounds IS 
'Bounding box of route geometry for quick spatial filtering';

-- ============================================================================
-- Step 5: Create Spatial Utility Functions
-- ============================================================================

-- Function to calculate distance from point to route
CREATE OR REPLACE FUNCTION get_distance_to_route(
  route_id UUID,
  point_lon DECIMAL,
  point_lat DECIMAL
)
RETURNS DECIMAL AS $$
BEGIN
  RETURN (
    SELECT ST_Distance(
      route_geom,
      ST_SetSRID(ST_MakePoint(point_lon, point_lat), 4326)
    ) * 111.32  -- Convert degrees to km (approximate)
    FROM traveller_routes
    WHERE id = route_id
  );
END;
$$ LANGUAGE plpgsql;

-- Function to find routes within buffer distance
CREATE OR REPLACE FUNCTION find_routes_within_buffer(
  point_lon DECIMAL,
  point_lat DECIMAL,
  buffer_km DECIMAL
)
RETURNS TABLE(route_id UUID, distance_km DECIMAL) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tr.id,
    (ST_Distance(
      tr.route_geom,
      ST_SetSRID(ST_MakePoint(point_lon, point_lat), 4326)
    ) * 111.32)::DECIMAL AS distance_km
  FROM traveller_routes tr
  WHERE tr.status = 'ACTIVE'
    AND ST_DWithin(
      tr.route_geom,
      ST_SetSRID(ST_MakePoint(point_lon, point_lat), 4326),
      buffer_km / 111.32  -- Convert km to degrees
    )
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to check if point is near route
CREATE OR REPLACE FUNCTION is_point_near_route(
  route_id UUID,
  point_lon DECIMAL,
  point_lat DECIMAL,
  buffer_km DECIMAL
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT ST_DWithin(
      route_geom,
      ST_SetSRID(ST_MakePoint(point_lon, point_lat), 4326),
      buffer_km / 111.32
    )
    FROM traveller_routes
    WHERE id = route_id
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Step 6: Create Spatial Matching View
-- ============================================================================
-- This view combines spatial and Place-ID matching

CREATE OR REPLACE VIEW v_spatial_route_matches AS
SELECT 
  tr.id as route_id,
  tr.traveller_profile_id,
  tr.vehicle_type,
  tr.max_weight_kg,
  tr.available_capacity_kg,
  tr.status,
  ST_AsText(tr.route_geom) as route_geometry,
  ST_Length(tr.route_geom) * 111.32 as route_length_km
FROM traveller_routes tr
WHERE tr.route_geom IS NOT NULL
  AND tr.status = 'ACTIVE';

-- ============================================================================
-- Step 7: Verify Setup
-- ============================================================================
-- Check if PostGIS is working

SELECT 
  'PostGIS Setup Complete' as status,
  postgis_version() as postgis_version,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_name = 'traveller_routes' AND column_name = 'route_geom') as route_geom_column_exists,
  (SELECT COUNT(*) FROM pg_indexes 
   WHERE tablename = 'traveller_routes' AND indexname LIKE 'idx_traveller_routes_geom%') as spatial_indexes_count;

-- ============================================================================
-- Notes
-- ============================================================================
-- 1. SRID 4326 is WGS84 (standard GPS coordinates)
-- 2. Distance calculations use ST_Distance (returns degrees)
-- 3. Multiply by 111.32 to convert degrees to km (approximate)
-- 4. ST_DWithin uses degrees, so divide buffer_km by 111.32
-- 5. GiST indexes are optimized for spatial queries
-- 6. Functions are created for common spatial operations
-- 7. View provides easy access to spatial route data

-- ============================================================================
-- Rollback Commands (if needed)
-- ============================================================================
-- DROP FUNCTION IF EXISTS get_distance_to_route(UUID, DECIMAL, DECIMAL);
-- DROP FUNCTION IF EXISTS find_routes_within_buffer(DECIMAL, DECIMAL, DECIMAL);
-- DROP FUNCTION IF EXISTS is_point_near_route(UUID, DECIMAL, DECIMAL, DECIMAL);
-- DROP VIEW IF EXISTS v_spatial_route_matches;
-- DROP INDEX IF EXISTS idx_traveller_routes_geom_route_id;
-- DROP INDEX IF EXISTS idx_traveller_routes_geom;
-- ALTER TABLE traveller_routes DROP COLUMN IF EXISTS route_geom;
-- ALTER TABLE traveller_routes DROP COLUMN IF EXISTS route_bounds;
-- DROP EXTENSION IF EXISTS postgis_topology;
-- DROP EXTENSION IF EXISTS postgis;

-- ============================================================================
