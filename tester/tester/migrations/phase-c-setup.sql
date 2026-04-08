-- ============================================================================
-- Phase C: Detour Optimization - Database Setup
-- ============================================================================
-- Creates tables for caching and cost tracking
-- Date: March 14, 2026
-- ============================================================================

-- Step 1: Create detour_cache table
-- ============================================================================
CREATE TABLE IF NOT EXISTS detour_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES traveller_routes(id) ON DELETE CASCADE,
  pickup_lon DECIMAL(10, 8) NOT NULL,
  pickup_lat DECIMAL(10, 8) NOT NULL,
  drop_lon DECIMAL(10, 8) NOT NULL,
  drop_lat DECIMAL(10, 8) NOT NULL,
  estimated_detour_km DECIMAL(10, 2) NOT NULL,
  actual_detour_km DECIMAL(10, 2),
  cache_hit_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  UNIQUE(route_id, pickup_lon, pickup_lat, drop_lon, drop_lat)
);

COMMENT ON TABLE detour_cache IS 'Caches detour estimations to avoid recalculation';
COMMENT ON COLUMN detour_cache.estimated_detour_km IS 'Estimated detour using geometry (lower-bound)';
COMMENT ON COLUMN detour_cache.actual_detour_km IS 'Actual detour from API (populated after API call)';
COMMENT ON COLUMN detour_cache.cache_hit_count IS 'Number of times this cache entry was used';
COMMENT ON COLUMN detour_cache.expires_at IS 'Cache expiration time (NULL = never expires)';

-- Step 2: Create cost_tracking table
-- ============================================================================
CREATE TABLE IF NOT EXISTS cost_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matching_request_id UUID NOT NULL,
  api_type VARCHAR(50) NOT NULL,
  cost_usd DECIMAL(10, 4) NOT NULL,
  api_calls_saved INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE cost_tracking IS 'Tracks API usage and costs for optimization monitoring';
COMMENT ON COLUMN cost_tracking.matching_request_id IS 'Reference to matching request';
COMMENT ON COLUMN cost_tracking.api_type IS 'Type of API (routes, geocoding, places)';
COMMENT ON COLUMN cost_tracking.cost_usd IS 'Cost of this API call in USD';
COMMENT ON COLUMN cost_tracking.api_calls_saved IS 'Number of API calls saved by optimization';

-- Step 3: Create optimization_config table
-- ============================================================================
CREATE TABLE IF NOT EXISTS optimization_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key VARCHAR(100) NOT NULL UNIQUE,
  config_value VARCHAR(255) NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE optimization_config IS 'Configuration settings for detour optimization';

-- Step 4: Create indexes
-- ============================================================================

-- Indexes on detour_cache
CREATE INDEX IF NOT EXISTS idx_detour_cache_route_id 
ON detour_cache(route_id);

CREATE INDEX IF NOT EXISTS idx_detour_cache_expires_at 
ON detour_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_detour_cache_created_at 
ON detour_cache(created_at);

-- Indexes on cost_tracking
CREATE INDEX IF NOT EXISTS idx_cost_tracking_request_id 
ON cost_tracking(matching_request_id);

CREATE INDEX IF NOT EXISTS idx_cost_tracking_created_at 
ON cost_tracking(created_at);

CREATE INDEX IF NOT EXISTS idx_cost_tracking_api_type 
ON cost_tracking(api_type);

-- Indexes on optimization_config
CREATE INDEX IF NOT EXISTS idx_optimization_config_key 
ON optimization_config(config_key);

-- Step 5: Insert default configuration
-- ============================================================================
INSERT INTO optimization_config (config_key, config_value, description)
VALUES 
  ('MAX_DETOUR_KM', '50', 'Maximum acceptable detour in kilometers'),
  ('DETOUR_RATIO_THRESHOLD', '0.2', 'Maximum detour ratio (detour / route_length)'),
  ('MAX_CANDIDATES_FOR_API', '10', 'Maximum candidates to call API for'),
  ('MIN_CANDIDATES_FOR_API', '1', 'Minimum candidates to call API for'),
  ('CACHE_TTL_MINUTES', '1440', 'Cache time-to-live in minutes (24 hours)'),
  ('COST_PER_API_CALL', '0.01', 'Cost per API call in USD'),
  ('ENABLE_OPTIMIZATION', 'true', 'Enable detour optimization'),
  ('ENABLE_CACHE', 'true', 'Enable detour caching'),
  ('ENABLE_COST_TRACKING', 'true', 'Enable cost tracking')
ON CONFLICT (config_key) DO NOTHING;

-- Step 6: Create utility functions
-- ============================================================================

-- Function to get cache statistics
CREATE OR REPLACE FUNCTION get_cache_stats()
RETURNS TABLE(
  total_entries BIGINT,
  total_hits BIGINT,
  avg_hits NUMERIC,
  valid_entries BIGINT,
  expired_entries BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT,
    COALESCE(SUM(cache_hit_count), 0)::BIGINT,
    COALESCE(AVG(cache_hit_count), 0)::NUMERIC,
    COUNT(CASE WHEN expires_at IS NULL OR expires_at > NOW() THEN 1 END)::BIGINT,
    COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 END)::BIGINT
  FROM detour_cache;
END;
$$ LANGUAGE plpgsql;

-- Function to get cost summary
CREATE OR REPLACE FUNCTION get_cost_summary(days_back INT DEFAULT 30)
RETURNS TABLE(
  total_calls BIGINT,
  total_cost NUMERIC,
  total_calls_saved BIGINT,
  avg_cost_per_call NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT,
    COALESCE(SUM(cost_usd), 0)::NUMERIC,
    COALESCE(SUM(api_calls_saved), 0)::BIGINT,
    CASE WHEN COUNT(*) > 0 THEN COALESCE(AVG(cost_usd), 0)::NUMERIC ELSE 0 END
  FROM cost_tracking
  WHERE created_at >= NOW() - (days_back || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Function to clear expired cache
CREATE OR REPLACE FUNCTION clear_expired_cache()
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM detour_cache 
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Create views
-- ============================================================================

-- View for cache performance
CREATE OR REPLACE VIEW v_cache_performance AS
SELECT 
  COUNT(*) as total_entries,
  SUM(cache_hit_count) as total_hits,
  CASE WHEN COUNT(*) > 0 THEN SUM(cache_hit_count)::FLOAT / COUNT(*) ELSE 0 END as avg_hits_per_entry,
  COUNT(CASE WHEN expires_at IS NULL OR expires_at > NOW() THEN 1 END) as valid_entries,
  COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 END) as expired_entries
FROM detour_cache;

-- View for cost analysis
CREATE OR REPLACE VIEW v_cost_analysis AS
SELECT 
  DATE(created_at) as date,
  api_type,
  COUNT(*) as call_count,
  SUM(cost_usd) as total_cost,
  AVG(cost_usd) as avg_cost,
  SUM(api_calls_saved) as calls_saved
FROM cost_tracking
GROUP BY DATE(created_at), api_type
ORDER BY date DESC, api_type;

-- Step 8: Verify setup
-- ============================================================================
SELECT 
  'Phase C Setup Complete' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'detour_cache') as detour_cache_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'cost_tracking') as cost_tracking_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'optimization_config') as optimization_config_exists,
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename IN ('detour_cache', 'cost_tracking', 'optimization_config')) as indexes_created;

-- ============================================================================
-- Notes
-- ============================================================================
-- 1. detour_cache stores estimated detours to avoid recalculation
-- 2. cost_tracking tracks API usage for cost analysis
-- 3. optimization_config stores configuration settings
-- 4. Indexes optimize common query patterns
-- 5. Functions provide utility operations
-- 6. Views provide easy access to analytics

-- ============================================================================
-- Rollback Commands (if needed)
-- ============================================================================
-- DROP VIEW IF EXISTS v_cost_analysis;
-- DROP VIEW IF EXISTS v_cache_performance;
-- DROP FUNCTION IF EXISTS clear_expired_cache();
-- DROP FUNCTION IF EXISTS get_cost_summary(INT);
-- DROP FUNCTION IF EXISTS get_cache_stats();
-- DROP TABLE IF EXISTS optimization_config;
-- DROP TABLE IF EXISTS cost_tracking;
-- DROP TABLE IF EXISTS detour_cache;

-- ============================================================================
