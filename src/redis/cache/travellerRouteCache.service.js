/**
 * Traveller Route Cache Service
 * 
 * Caches active traveller routes with polylines for matching engine.
 * Critical for performance as matching queries routes constantly.
 * 
 * Redis key schema:
 *   route:{route_id} → JSON route data (TTL: 1 hour)
 *   routes:active → Set of active route IDs (TTL: 1 hour)
 *   routes:traveller:{traveller_id} → Set of route IDs for traveller (TTL: 1 hour)
 */

import redis from "../redis.config.js";
import sequelize from "../../config/database.config.js";

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRedisAvailable() {
  return redis !== null && redis.status === "ready";
}

function getRouteCacheKey(routeId) {
  return `route:${routeId}`;
}

function getActiveRoutesKey() {
  return "routes:active";
}

function getTravellerRoutesKey(travellerId) {
  return `routes:traveller:${travellerId}`;
}

// ─── Cache Route ──────────────────────────────────────────────────────────────

/**
 * Cache a single route
 * 
 * @param {string} routeId - Route ID
 * @param {Object} routeData - Route data with polyline
 * @returns {Promise<boolean>} Success status
 */
export async function cacheRoute(routeId, routeData) {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    const key = getRouteCacheKey(routeId);
    await redis.set(key, JSON.stringify(routeData), "EX", CACHE_TTL_SECONDS);
    
    // Add to active routes set if status is active
    if (routeData.status === "active") {
      await redis.sadd(getActiveRoutesKey(), routeId);
      await redis.expire(getActiveRoutesKey(), CACHE_TTL_SECONDS);
      
      // Add to traveller's routes set
      if (routeData.traveller_id) {
        await redis.sadd(getTravellerRoutesKey(routeData.traveller_id), routeId);
        await redis.expire(getTravellerRoutesKey(routeData.traveller_id), CACHE_TTL_SECONDS);
      }
    }
    
    console.log(`[RouteCache] Cached route ${routeId}`);
    return true;

  } catch (error) {
    console.error("[RouteCache] Error caching route:", error.message);
    return false;
  }
}

// ─── Get Cached Route ─────────────────────────────────────────────────────────

/**
 * Get cached route
 * 
 * @param {string} routeId - Route ID
 * @returns {Promise<Object|null>} Cached route data or null
 */
export async function getCachedRoute(routeId) {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    const key = getRouteCacheKey(routeId);
    const cached = await redis.get(key);
    
    if (cached) {
      console.log(`[RouteCache] Cache HIT for route ${routeId}`);
      return JSON.parse(cached);
    }

    console.log(`[RouteCache] Cache MISS for route ${routeId}`);
    return null;

  } catch (error) {
    console.error("[RouteCache] Error getting cached route:", error.message);
    return null;
  }
}

// ─── Get Route (with caching) ─────────────────────────────────────────────────

/**
 * Get route (checks cache first, then database)
 * 
 * @param {string} routeId - Route ID
 * @returns {Promise<Object|null>} Route data
 */
export async function getRoute(routeId) {
  try {
    // Try cache first
    const cached = await getCachedRoute(routeId);
    if (cached) {
      return cached;
    }

    // Cache miss - query database
    console.log(`[RouteCache] Querying database for route ${routeId}`);
    
    const result = await sequelize.query(
      `SELECT tr.*, tp.user_id as traveller_user_id
       FROM traveller_routes tr
       LEFT JOIN traveller_profiles tp ON tr.traveller_id = tp.id
       WHERE tr.id = :routeId`,
      { 
        replacements: { routeId },
        type: sequelize.QueryTypes.SELECT 
      }
    );

    if (!result || result.length === 0) {
      return null;
    }

    const routeData = result[0];

    // Cache the result
    await cacheRoute(routeId, routeData);

    return routeData;

  } catch (error) {
    console.error("[RouteCache] Error getting route:", error.message);
    return null;
  }
}

// ─── Get Active Routes (with caching) ─────────────────────────────────────────

/**
 * Get all active routes for matching
 * 
 * @returns {Promise<Array>} Array of active routes
 */
export async function getActiveRoutes() {
  try {
    if (isRedisAvailable()) {
      // Try to get active route IDs from cache
      const routeIds = await redis.smembers(getActiveRoutesKey());
      
      if (routeIds && routeIds.length > 0) {
        console.log(`[RouteCache] Cache HIT: ${routeIds.length} active routes`);
        
        // Get all routes from cache
        const pipeline = redis.pipeline();
        routeIds.forEach(id => pipeline.get(getRouteCacheKey(id)));
        const results = await pipeline.exec();
        
        const routes = results
          .filter(([err, data]) => !err && data)
          .map(([, data]) => JSON.parse(data));
        
        if (routes.length === routeIds.length) {
          return routes;
        }
      }
    }

    // Cache miss - query database
    console.log("[RouteCache] Querying database for active routes");
    
    const routes = await sequelize.query(
      `SELECT tr.*, tp.user_id as traveller_user_id
       FROM traveller_routes tr
       LEFT JOIN traveller_profiles tp ON tr.traveller_id = tp.id
       WHERE tr.status = 'active'
       ORDER BY tr.created_at DESC`,
      { type: sequelize.QueryTypes.SELECT }
    );

    // Cache all active routes
    if (isRedisAvailable() && routes.length > 0) {
      const pipeline = redis.pipeline();
      
      routes.forEach(route => {
        pipeline.set(getRouteCacheKey(route.id), JSON.stringify(route), "EX", CACHE_TTL_SECONDS);
        pipeline.sadd(getActiveRoutesKey(), route.id);
      });
      
      pipeline.expire(getActiveRoutesKey(), CACHE_TTL_SECONDS);
      await pipeline.exec();
      
      console.log(`[RouteCache] Cached ${routes.length} active routes`);
    }

    return routes;

  } catch (error) {
    console.error("[RouteCache] Error getting active routes:", error.message);
    return [];
  }
}

// ─── Get Traveller Routes (with caching) ──────────────────────────────────────

/**
 * Get all routes for a specific traveller
 * 
 * @param {string} travellerId - Traveller ID
 * @returns {Promise<Array>} Array of routes
 */
export async function getTravellerRoutes(travellerId) {
  try {
    if (isRedisAvailable()) {
      const routeIds = await redis.smembers(getTravellerRoutesKey(travellerId));
      
      if (routeIds && routeIds.length > 0) {
        console.log(`[RouteCache] Cache HIT: ${routeIds.length} routes for traveller ${travellerId}`);
        
        const pipeline = redis.pipeline();
        routeIds.forEach(id => pipeline.get(getRouteCacheKey(id)));
        const results = await pipeline.exec();
        
        const routes = results
          .filter(([err, data]) => !err && data)
          .map(([, data]) => JSON.parse(data));
        
        if (routes.length === routeIds.length) {
          return routes;
        }
      }
    }

    // Cache miss - query database
    console.log(`[RouteCache] Querying database for traveller ${travellerId} routes`);
    
    const routes = await sequelize.query(
      `SELECT tr.*, tp.user_id as traveller_user_id
       FROM traveller_routes tr
       LEFT JOIN traveller_profiles tp ON tr.traveller_id = tp.id
       WHERE tr.traveller_id = :travellerId
       ORDER BY tr.created_at DESC`,
      { 
        replacements: { travellerId },
        type: sequelize.QueryTypes.SELECT 
      }
    );

    // Cache routes
    if (isRedisAvailable() && routes.length > 0) {
      const pipeline = redis.pipeline();
      
      routes.forEach(route => {
        pipeline.set(getRouteCacheKey(route.id), JSON.stringify(route), "EX", CACHE_TTL_SECONDS);
        pipeline.sadd(getTravellerRoutesKey(travellerId), route.id);
      });
      
      pipeline.expire(getTravellerRoutesKey(travellerId), CACHE_TTL_SECONDS);
      await pipeline.exec();
    }

    return routes;

  } catch (error) {
    console.error("[RouteCache] Error getting traveller routes:", error.message);
    return [];
  }
}

// ─── Invalidate Route Cache ───────────────────────────────────────────────────

/**
 * Invalidate cached route (when route is updated/deleted)
 * 
 * @param {string} routeId - Route ID
 * @param {string} travellerId - Traveller ID (optional)
 * @returns {Promise<boolean>} Success status
 */
export async function invalidateRouteCache(routeId, travellerId = null) {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    const key = getRouteCacheKey(routeId);
    await redis.del(key);
    
    // Remove from active routes set
    await redis.srem(getActiveRoutesKey(), routeId);
    
    // Remove from traveller's routes set
    if (travellerId) {
      await redis.srem(getTravellerRoutesKey(travellerId), routeId);
    }
    
    console.log(`[RouteCache] Invalidated cache for route ${routeId}`);
    return true;

  } catch (error) {
    console.error("[RouteCache] Error invalidating cache:", error.message);
    return false;
  }
}

// ─── Invalidate All Active Routes Cache ───────────────────────────────────────

/**
 * Invalidate all active routes cache (for bulk updates)
 * 
 * @returns {Promise<boolean>} Success status
 */
export async function invalidateActiveRoutesCache() {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    await redis.del(getActiveRoutesKey());
    console.log("[RouteCache] Invalidated active routes cache");
    return true;

  } catch (error) {
    console.error("[RouteCache] Error invalidating active routes cache:", error.message);
    return false;
  }
}

export default { 
  cacheRoute, 
  getCachedRoute, 
  getRoute,
  getActiveRoutes,
  getTravellerRoutes,
  invalidateRouteCache,
  invalidateActiveRoutesCache
};
