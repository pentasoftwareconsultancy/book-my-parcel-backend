/**
 * Detour Cache Service
 * Caches detour estimations to avoid recalculation
 * Improves performance and reduces database queries
 */

import sequelize from "../config/database.config.js";

// In-memory cache (can be replaced with Redis for distributed caching)
const memoryCache = new Map();

/**
 * Generate cache key from parameters
 * 
 * @param {string} routeId - Route UUID
 * @param {number} pickupLon - Pickup longitude
 * @param {number} pickupLat - Pickup latitude
 * @param {number} dropLon - Drop longitude
 * @param {number} dropLat - Drop latitude
 * @returns {string} Cache key
 */
function generateCacheKey(routeId, pickupLon, pickupLat, dropLon, dropLat) {
  return `detour_${routeId}_${pickupLon}_${pickupLat}_${dropLon}_${dropLat}`;
}

/**
 * Get cached detour estimation
 * 
 * @param {string} routeId - Route UUID
 * @param {number} pickupLon - Pickup longitude
 * @param {number} pickupLat - Pickup latitude
 * @param {number} dropLon - Drop longitude
 * @param {number} dropLat - Drop latitude
 * @returns {Promise<Object|null>} Cached detour or null
 */
export async function getCachedDetour(
  routeId,
  pickupLon,
  pickupLat,
  dropLon,
  dropLat
) {
  try {
    const key = generateCacheKey(routeId, pickupLon, pickupLat, dropLon, dropLat);

    // Check memory cache first
    if (memoryCache.has(key)) {
      const cached = memoryCache.get(key);
      if (cached.expires_at > Date.now()) {
        console.log(`[DetourCache] Cache hit (memory): ${key}`);
        cached.cache_hit_count++;
        return cached.data;
      } else {
        memoryCache.delete(key);
      }
    }

    // Check database cache
    const result = await sequelize.query(
      `
      SELECT 
        estimated_detour_km,
        pickup_lon,
        pickup_lat,
        drop_lon,
        drop_lat,
        actual_detour_km,
        cache_hit_count
      FROM detour_cache
      WHERE route_id = :routeId
        AND pickup_lon = :pickupLon
        AND pickup_lat = :pickupLat
        AND drop_lon = :dropLon
        AND drop_lat = :dropLat
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1
      `,
      {
        replacements: {
          routeId,
          pickupLon,
          pickupLat,
          dropLon,
          dropLat,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (result.length > 0) {
      console.log(`[DetourCache] Cache hit (database): ${key}`);

      // Update cache hit count
      await sequelize.query(
        `
        UPDATE detour_cache
        SET cache_hit_count = cache_hit_count + 1
        WHERE route_id = :routeId
          AND pickup_lon = :pickupLon
          AND pickup_lat = :pickupLat
          AND drop_lon = :dropLon
          AND drop_lat = :dropLat
        `,
        {
          replacements: {
            routeId,
            pickupLon,
            pickupLat,
            dropLon,
            dropLat,
          },
        }
      );

      // Store in memory cache
      memoryCache.set(key, {
        data: result[0],
        expires_at: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        cache_hit_count: result[0].cache_hit_count + 1,
      });

      return result[0];
    }

    console.log(`[DetourCache] Cache miss: ${key}`);
    return null;
  } catch (error) {
    console.error('[DetourCache] Error getting cached detour:', error);
    return null;
  }
}

/**
 * Set cached detour estimation
 * 
 * @param {string} routeId - Route UUID
 * @param {number} pickupLon - Pickup longitude
 * @param {number} pickupLat - Pickup latitude
 * @param {number} dropLon - Drop longitude
 * @param {number} dropLat - Drop latitude
 * @param {Object} detourData - Detour data {estimated_detour_km, pickup_distance_km, drop_distance_km, route_length_km}
 * @param {number} ttlMinutes - Time-to-live in minutes (default: 1440 = 24 hours)
 * @returns {Promise<boolean>} True if cached successfully
 */
export async function setCachedDetour(
  routeId,
  pickupLon,
  pickupLat,
  dropLon,
  dropLat,
  detourData,
  ttlMinutes = 1440
) {
  try {
    const key = generateCacheKey(routeId, pickupLon, pickupLat, dropLon, dropLat);

    // Store in database
    await sequelize.query(
      `
      INSERT INTO detour_cache (
        route_id,
        pickup_lon,
        pickup_lat,
        drop_lon,
        drop_lat,
        estimated_detour_km,
        expires_at
      ) VALUES (
        :routeId,
        :pickupLon,
        :pickupLat,
        :dropLon,
        :dropLat,
        :estimatedDetour,
        NOW() + INTERVAL '${ttlMinutes} minutes'
      )
      ON CONFLICT (route_id, pickup_lon, pickup_lat, drop_lon, drop_lat)
      DO UPDATE SET
        estimated_detour_km = :estimatedDetour,
        expires_at = NOW() + INTERVAL '${ttlMinutes} minutes'
      `,
      {
        replacements: {
          routeId,
          pickupLon,
          pickupLat,
          dropLon,
          dropLat,
          estimatedDetour: detourData.estimated_detour_km,
        },
      }
    );

    // Store in memory cache
    memoryCache.set(key, {
      data: detourData,
      expires_at: Date.now() + ttlMinutes * 60 * 1000,
      cache_hit_count: 0,
    });

    console.log(`[DetourCache] Cached detour: ${key}`);
    return true;
  } catch (error) {
    console.error('[DetourCache] Error setting cached detour:', error);
    return false;
  }
}

/**
 * Invalidate cache for a route
 * Called when route is updated
 * 
 * @param {string} routeId - Route UUID
 * @returns {Promise<boolean>} True if invalidated successfully
 */
export async function invalidateCache(routeId) {
  try {
    // Delete from database
    await sequelize.query(
      `DELETE FROM detour_cache WHERE route_id = :routeId`,
      {
        replacements: { routeId },
      }
    );

    // Delete from memory cache
    for (const [key] of memoryCache) {
      if (key.includes(routeId)) {
        memoryCache.delete(key);
      }
    }

    console.log(`[DetourCache] Invalidated cache for route: ${routeId}`);
    return true;
  } catch (error) {
    console.error('[DetourCache] Error invalidating cache:', error);
    return false;
  }
}

/**
 * Clear all expired cache entries
 * Should be called periodically
 * 
 * @returns {Promise<number>} Number of entries deleted
 */
export async function clearExpiredCache() {
  try {
    const result = await sequelize.query(
      `DELETE FROM detour_cache WHERE expires_at IS NOT NULL AND expires_at < NOW()`
    );

    // Clear expired from memory cache
    for (const [key, value] of memoryCache) {
      if (value.expires_at < Date.now()) {
        memoryCache.delete(key);
      }
    }

    console.log(`[DetourCache] Cleared expired cache entries`);
    return result[0]?.rowCount || 0;
  } catch (error) {
    console.error('[DetourCache] Error clearing expired cache:', error);
    return 0;
  }
}

/**
 * Get cache statistics
 * 
 * @returns {Promise<Object>} Cache stats
 */
export async function getCacheStats() {
  try {
    const dbStats = await sequelize.query(
      `
      SELECT 
        COUNT(*) as total_entries,
        SUM(cache_hit_count) as total_hits,
        AVG(cache_hit_count) as avg_hits,
        MAX(cache_hit_count) as max_hits,
        COUNT(CASE WHEN expires_at IS NULL OR expires_at > NOW() THEN 1 END) as valid_entries,
        COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 END) as expired_entries
      FROM detour_cache
      `,
      { type: sequelize.QueryTypes.SELECT }
    );

    const stats = dbStats[0] || {};
    const memorySize = memoryCache.size;

    console.log(
      `[DetourCache] Stats: ${stats.total_entries} total, ${stats.total_hits} hits, ${memorySize} in memory`
    );

    return {
      database: {
        total_entries: parseInt(stats.total_entries) || 0,
        total_hits: parseInt(stats.total_hits) || 0,
        avg_hits: parseFloat(stats.avg_hits) || 0,
        max_hits: parseInt(stats.max_hits) || 0,
        valid_entries: parseInt(stats.valid_entries) || 0,
        expired_entries: parseInt(stats.expired_entries) || 0,
      },
      memory: {
        entries: memorySize,
      },
      hit_rate: stats.total_entries > 0 ? (stats.total_hits / stats.total_entries).toFixed(2) : 0,
    };
  } catch (error) {
    console.error('[DetourCache] Error getting cache stats:', error);
    return null;
  }
}

/**
 * Update actual detour after API call
 * Useful for validating estimation accuracy
 * 
 * @param {string} routeId - Route UUID
 * @param {number} pickupLon - Pickup longitude
 * @param {number} pickupLat - Pickup latitude
 * @param {number} dropLon - Drop longitude
 * @param {number} dropLat - Drop latitude
 * @param {number} actualDetourKm - Actual detour from API
 * @returns {Promise<boolean>} True if updated successfully
 */
export async function updateActualDetour(
  routeId,
  pickupLon,
  pickupLat,
  dropLon,
  dropLat,
  actualDetourKm
) {
  try {
    await sequelize.query(
      `
      UPDATE detour_cache
      SET actual_detour_km = :actualDetourKm
      WHERE route_id = :routeId
        AND pickup_lon = :pickupLon
        AND pickup_lat = :pickupLat
        AND drop_lon = :dropLon
        AND drop_lat = :dropLat
      `,
      {
        replacements: {
          routeId,
          pickupLon,
          pickupLat,
          dropLon,
          dropLat,
          actualDetourKm,
        },
      }
    );

    console.log(`[DetourCache] Updated actual detour for route: ${routeId}`);
    return true;
  } catch (error) {
    console.error('[DetourCache] Error updating actual detour:', error);
    return false;
  }
}

/**
 * Get cache hit rate
 * 
 * @returns {Promise<number>} Hit rate percentage (0-100)
 */
export async function getCacheHitRate() {
  try {
    const stats = await getCacheStats();
    if (!stats) {
      return 0;
    }
    return parseFloat(stats.hit_rate) * 100;
  } catch (error) {
    console.error('[DetourCache] Error getting cache hit rate:', error);
    return 0;
  }
}

export default {
  getCachedDetour,
  setCachedDetour,
  invalidateCache,
  clearExpiredCache,
  getCacheStats,
  updateActualDetour,
  getCacheHitRate,
};
