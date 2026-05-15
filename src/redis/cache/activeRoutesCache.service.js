/**
 * Active Routes Cache Service
 * 
 * Caches the set of active route IDs for matching engine.
 * Prevents repeated queries for the same active routes list.
 * 
 * Redis key schema:
 *   matching:active_route_ids → Set of active route IDs (TTL: 5 min)
 *   matching:active_routes_full → JSON array of full route data (TTL: 5 min)
 */

import redis from "../redis.config.js";

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRedisAvailable() {
  return redis !== null && redis.status === "ready";
}

function getActiveRouteIdsKey() {
  return "matching:active_route_ids";
}

function getActiveRoutesFullKey() {
  return "matching:active_routes_full";
}

// ─── Cache Active Route IDs ───────────────────────────────────────────────────

/**
 * Cache set of active route IDs
 * 
 * @param {Array<string>} routeIds - Array of route IDs
 * @returns {Promise<boolean>} Success status
 */
export async function cacheActiveRouteIds(routeIds) {
  if (!isRedisAvailable() || !routeIds || routeIds.length === 0) return false;

  try {
    const key = getActiveRouteIdsKey();
    
    // Delete old set and create new one
    await redis.del(key);
    await redis.sadd(key, ...routeIds);
    await redis.expire(key, CACHE_TTL_SECONDS);
    
    console.log(`[ActiveRoutesCache] Cached ${routeIds.length} active route IDs`);
    return true;

  } catch (error) {
    console.error("[ActiveRoutesCache] Error caching active route IDs:", error.message);
    return false;
  }
}

/**
 * Get cached active route IDs
 * 
 * @returns {Promise<Array<string>|null>} Array of route IDs or null
 */
export async function getCachedActiveRouteIds() {
  if (!isRedisAvailable()) return null;

  try {
    const key = getActiveRouteIdsKey();
    const routeIds = await redis.smembers(key);
    
    if (routeIds && routeIds.length > 0) {
      console.log(`[ActiveRoutesCache] Cache HIT: ${routeIds.length} active route IDs`);
      return routeIds;
    }

    console.log(`[ActiveRoutesCache] Cache MISS: active route IDs`);
    return null;

  } catch (error) {
    console.error("[ActiveRoutesCache] Error getting cached active route IDs:", error.message);
    return null;
  }
}

// ─── Cache Full Active Routes ─────────────────────────────────────────────────

/**
 * Cache full active routes data (with all fields)
 * 
 * @param {Array<Object>} routes - Array of route objects
 * @returns {Promise<boolean>} Success status
 */
export async function cacheActiveRoutesFull(routes) {
  if (!isRedisAvailable() || !routes || routes.length === 0) return false;

  try {
    const key = getActiveRoutesFullKey();
    await redis.set(key, JSON.stringify(routes), "EX", CACHE_TTL_SECONDS);
    
    console.log(`[ActiveRoutesCache] Cached ${routes.length} full active routes`);
    return true;

  } catch (error) {
    console.error("[ActiveRoutesCache] Error caching full active routes:", error.message);
    return false;
  }
}

/**
 * Get cached full active routes data
 * 
 * @returns {Promise<Array<Object>|null>} Array of route objects or null
 */
export async function getCachedActiveRoutesFull() {
  if (!isRedisAvailable()) return null;

  try {
    const key = getActiveRoutesFullKey();
    const cached = await redis.get(key);
    
    if (cached) {
      const routes = JSON.parse(cached);
      console.log(`[ActiveRoutesCache] Cache HIT: ${routes.length} full active routes`);
      return routes;
    }

    console.log(`[ActiveRoutesCache] Cache MISS: full active routes`);
    return null;

  } catch (error) {
    console.error("[ActiveRoutesCache] Error getting cached full active routes:", error.message);
    return null;
  }
}

// ─── Add/Remove Single Route ──────────────────────────────────────────────────

/**
 * Add a single route ID to the active routes set
 * 
 * @param {string} routeId - Route ID to add
 * @returns {Promise<boolean>} Success status
 */
export async function addActiveRouteId(routeId) {
  if (!isRedisAvailable() || !routeId) return false;

  try {
    const key = getActiveRouteIdsKey();
    await redis.sadd(key, routeId);
    await redis.expire(key, CACHE_TTL_SECONDS);
    
    // Invalidate full routes cache since it's now stale
    await redis.del(getActiveRoutesFullKey());
    
    console.log(`[ActiveRoutesCache] Added route ${routeId} to active set`);
    return true;

  } catch (error) {
    console.error("[ActiveRoutesCache] Error adding active route ID:", error.message);
    return false;
  }
}

/**
 * Remove a single route ID from the active routes set
 * 
 * @param {string} routeId - Route ID to remove
 * @returns {Promise<boolean>} Success status
 */
export async function removeActiveRouteId(routeId) {
  if (!isRedisAvailable() || !routeId) return false;

  try {
    const key = getActiveRouteIdsKey();
    await redis.srem(key, routeId);
    
    // Invalidate full routes cache since it's now stale
    await redis.del(getActiveRoutesFullKey());
    
    console.log(`[ActiveRoutesCache] Removed route ${routeId} from active set`);
    return true;

  } catch (error) {
    console.error("[ActiveRoutesCache] Error removing active route ID:", error.message);
    return false;
  }
}

// ─── Invalidate Active Routes Cache ───────────────────────────────────────────

/**
 * Invalidate all active routes cache
 * 
 * @returns {Promise<boolean>} Success status
 */
export async function invalidateActiveRoutesCache() {
  if (!isRedisAvailable()) return false;

  try {
    await redis.del(getActiveRouteIdsKey());
    await redis.del(getActiveRoutesFullKey());
    
    console.log("[ActiveRoutesCache] Invalidated active routes cache");
    return true;

  } catch (error) {
    console.error("[ActiveRoutesCache] Error invalidating cache:", error.message);
    return false;
  }
}

// ─── Get Cache Stats ──────────────────────────────────────────────────────────

/**
 * Get active routes cache statistics
 * 
 * @returns {Promise<Object>} Cache statistics
 */
export async function getActiveRoutesCacheStats() {
  if (!isRedisAvailable()) {
    return { cached_route_ids: 0, has_full_cache: false, redis_available: false };
  }

  try {
    const routeIds = await redis.smembers(getActiveRouteIdsKey());
    const hasFull = await redis.exists(getActiveRoutesFullKey());

    return {
      cached_route_ids: routeIds ? routeIds.length : 0,
      has_full_cache: hasFull === 1,
      redis_available: true,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error("[ActiveRoutesCache] Stats error:", error.message);
    return { cached_route_ids: 0, has_full_cache: false, redis_available: false, error: error.message };
  }
}

export default { 
  cacheActiveRouteIds, 
  getCachedActiveRouteIds,
  cacheActiveRoutesFull,
  getCachedActiveRoutesFull,
  addActiveRouteId,
  removeActiveRouteId,
  invalidateActiveRoutesCache,
  getActiveRoutesCacheStats
};
