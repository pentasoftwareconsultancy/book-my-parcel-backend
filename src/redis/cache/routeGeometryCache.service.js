/**
 * Route Geometry Cache Service
 * 
 * Caches route geometries (PostGIS data) for spatial operations.
 * Reduces expensive geometry queries in matching and detour calculations.
 * 
 * Redis key schema:
 *   route:geom:{route_id} → JSON geometry data (TTL: 1 hour)
 *   route:geojson:{route_id} → GeoJSON representation (TTL: 1 hour)
 */

import redis from "../redis.config.js";

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRedisAvailable() {
  return redis !== null && redis.status === "ready";
}

function getGeometryKey(routeId) {
  return `route:geom:${routeId}`;
}

function getGeoJSONKey(routeId) {
  return `route:geojson:${routeId}`;
}

// ─── Cache Route Geometry ─────────────────────────────────────────────────────

/**
 * Cache route geometry data
 * 
 * @param {string} routeId - Route ID
 * @param {Object} geometryData - Geometry data from PostGIS
 * @returns {Promise<boolean>} Success status
 */
export async function cacheRouteGeometry(routeId, geometryData) {
  if (!isRedisAvailable() || !routeId || !geometryData) return false;

  try {
    const key = getGeometryKey(routeId);
    await redis.set(key, JSON.stringify(geometryData), "EX", CACHE_TTL_SECONDS);
    
    console.log(`[RouteGeometryCache] Cached geometry for route ${routeId}`);
    return true;

  } catch (error) {
    console.error("[RouteGeometryCache] Error caching geometry:", error.message);
    return false;
  }
}

/**
 * Get cached route geometry data
 * 
 * @param {string} routeId - Route ID
 * @returns {Promise<Object|null>} Geometry data or null
 */
export async function getCachedRouteGeometry(routeId) {
  if (!isRedisAvailable() || !routeId) return null;

  try {
    const key = getGeometryKey(routeId);
    const cached = await redis.get(key);
    
    if (cached) {
      console.log(`[RouteGeometryCache] Cache HIT for route ${routeId} geometry`);
      return JSON.parse(cached);
    }

    console.log(`[RouteGeometryCache] Cache MISS for route ${routeId} geometry`);
    return null;

  } catch (error) {
    console.error("[RouteGeometryCache] Error getting cached geometry:", error.message);
    return null;
  }
}

// ─── Cache Route GeoJSON ──────────────────────────────────────────────────────

/**
 * Cache route GeoJSON representation
 * 
 * @param {string} routeId - Route ID
 * @param {Object} geoJSON - GeoJSON FeatureCollection
 * @returns {Promise<boolean>} Success status
 */
export async function cacheRouteGeoJSON(routeId, geoJSON) {
  if (!isRedisAvailable() || !routeId || !geoJSON) return false;

  try {
    const key = getGeoJSONKey(routeId);
    await redis.set(key, JSON.stringify(geoJSON), "EX", CACHE_TTL_SECONDS);
    
    console.log(`[RouteGeometryCache] Cached GeoJSON for route ${routeId}`);
    return true;

  } catch (error) {
    console.error("[RouteGeometryCache] Error caching GeoJSON:", error.message);
    return false;
  }
}

/**
 * Get cached route GeoJSON representation
 * 
 * @param {string} routeId - Route ID
 * @returns {Promise<Object|null>} GeoJSON or null
 */
export async function getCachedRouteGeoJSON(routeId) {
  if (!isRedisAvailable() || !routeId) return null;

  try {
    const key = getGeoJSONKey(routeId);
    const cached = await redis.get(key);
    
    if (cached) {
      console.log(`[RouteGeometryCache] Cache HIT for route ${routeId} GeoJSON`);
      return JSON.parse(cached);
    }

    console.log(`[RouteGeometryCache] Cache MISS for route ${routeId} GeoJSON`);
    return null;

  } catch (error) {
    console.error("[RouteGeometryCache] Error getting cached GeoJSON:", error.message);
    return null;
  }
}

// ─── Batch Cache Multiple Routes ──────────────────────────────────────────────

/**
 * Cache geometries for multiple routes
 * 
 * @param {Array<Object>} routes - Array of {routeId, geometryData} objects
 * @returns {Promise<number>} Number of routes cached successfully
 */
export async function batchCacheRouteGeometries(routes) {
  if (!isRedisAvailable() || !routes || routes.length === 0) return 0;

  let cached = 0;

  try {
    const pipeline = redis.pipeline();

    for (const { routeId, geometryData } of routes) {
      if (routeId && geometryData) {
        const key = getGeometryKey(routeId);
        pipeline.set(key, JSON.stringify(geometryData), "EX", CACHE_TTL_SECONDS);
      }
    }

    const results = await pipeline.exec();
    cached = results.filter(([err, result]) => !err && result === "OK").length;

    console.log(`[RouteGeometryCache] Batch cached ${cached}/${routes.length} route geometries`);
    return cached;

  } catch (error) {
    console.error("[RouteGeometryCache] Batch cache error:", error.message);
    return cached;
  }
}

// ─── Invalidate Route Geometry Cache ──────────────────────────────────────────

/**
 * Invalidate cached geometry for a specific route
 * 
 * @param {string} routeId - Route ID
 * @returns {Promise<boolean>} Success status
 */
export async function invalidateRouteGeometry(routeId) {
  if (!isRedisAvailable() || !routeId) return false;

  try {
    await redis.del(getGeometryKey(routeId));
    await redis.del(getGeoJSONKey(routeId));
    
    console.log(`[RouteGeometryCache] Invalidated geometry for route ${routeId}`);
    return true;

  } catch (error) {
    console.error("[RouteGeometryCache] Error invalidating geometry:", error.message);
    return false;
  }
}

/**
 * Invalidate all route geometries cache
 * 
 * @returns {Promise<number>} Number of keys deleted
 */
export async function invalidateAllRouteGeometries() {
  if (!isRedisAvailable()) return 0;

  try {
    let cursor = "0";
    let deleted = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "route:geom:*", "COUNT", 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== "0");

    // Also delete GeoJSON cache
    cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "route:geojson:*", "COUNT", 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== "0");

    console.log(`[RouteGeometryCache] Invalidated ${deleted} geometry cache entries`);
    return deleted;

  } catch (error) {
    console.error("[RouteGeometryCache] Error invalidating all geometries:", error.message);
    return 0;
  }
}

// ─── Get Cache Stats ──────────────────────────────────────────────────────────

/**
 * Get route geometry cache statistics
 * 
 * @returns {Promise<Object>} Cache statistics
 */
export async function getRouteGeometryCacheStats() {
  if (!isRedisAvailable()) {
    return { total_cached_geometries: 0, total_cached_geojson: 0, redis_available: false };
  }

  try {
    let cursor = "0";
    let totalGeometries = 0;
    let totalGeoJSON = 0;

    // Count geometries
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "route:geom:*", "COUNT", 100);
      cursor = nextCursor;
      totalGeometries += keys.length;
    } while (cursor !== "0");

    // Count GeoJSON
    cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "route:geojson:*", "COUNT", 100);
      cursor = nextCursor;
      totalGeoJSON += keys.length;
    } while (cursor !== "0");

    return {
      total_cached_geometries: totalGeometries,
      total_cached_geojson: totalGeoJSON,
      redis_available: true,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error("[RouteGeometryCache] Stats error:", error.message);
    return { total_cached_geometries: 0, total_cached_geojson: 0, redis_available: false, error: error.message };
  }
}

export default { 
  cacheRouteGeometry, 
  getCachedRouteGeometry,
  cacheRouteGeoJSON,
  getCachedRouteGeoJSON,
  batchCacheRouteGeometries,
  invalidateRouteGeometry,
  invalidateAllRouteGeometries,
  getRouteGeometryCacheStats
};
