/**
 * Device Token Cache Service
 * 
 * Caches FCM device tokens in Redis for faster push notification delivery.
 * Reduces database queries and improves notification performance.
 * 
 * Redis key schema:
 *   fcm_tokens:{user_id} → JSON array of token objects (TTL: 24 hours)
 */

import redis from "../redis.config.js";
import sequelize from "../../config/database.config.js";

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRedisAvailable() {
  return redis !== null && redis.status === "ready";
}

function getTokenCacheKey(userId) {
  return `fcm_tokens:${userId}`;
}

// ─── Cache Device Tokens ──────────────────────────────────────────────────────

/**
 * Cache device tokens for a user
 * 
 * @param {string} userId - User ID
 * @param {Array} tokens - Array of token objects from database
 * @returns {Promise<boolean>} Success status
 */
export async function cacheDeviceTokens(userId, tokens) {
  if (!isRedisAvailable()) {
    console.warn("[DeviceTokenCache] Redis unavailable - tokens not cached");
    return false;
  }

  try {
    const key = getTokenCacheKey(userId);
    const tokenData = JSON.stringify(tokens);
    
    await redis.set(key, tokenData, "EX", CACHE_TTL_SECONDS);
    
    console.log(`[DeviceTokenCache] Cached ${tokens.length} tokens for user ${userId}`);
    return true;

  } catch (error) {
    console.error("[DeviceTokenCache] Error caching tokens:", error.message);
    return false;
  }
}

// ─── Get Cached Device Tokens ─────────────────────────────────────────────────

/**
 * Get cached device tokens for a user
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Array|null>} Cached tokens or null if not found
 */
export async function getCachedDeviceTokens(userId) {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    const key = getTokenCacheKey(userId);
    const cached = await redis.get(key);
    
    if (cached) {
      const tokens = JSON.parse(cached);
      console.log(`[DeviceTokenCache] Cache HIT: ${tokens.length} tokens for user ${userId}`);
      return tokens;
    }

    console.log(`[DeviceTokenCache] Cache MISS for user ${userId}`);
    return null;

  } catch (error) {
    console.error("[DeviceTokenCache] Error getting cached tokens:", error.message);
    return null;
  }
}

// ─── Get Device Tokens (with caching) ─────────────────────────────────────────

/**
 * Get device tokens for a user (checks cache first, then database)
 * 
 * @param {string} userId - User ID
 * @param {string} deviceType - Device type filter ('mobile', 'web', or null for all)
 * @returns {Promise<Array>} Array of device tokens
 */
export async function getDeviceTokens(userId, deviceType = null) {
  try {
    // Try cache first
    const cached = await getCachedDeviceTokens(userId);
    if (cached) {
      // Filter by device type if specified
      if (deviceType) {
        return cached.filter(token => token.device_type === deviceType);
      }
      return cached;
    }

    // Cache miss - query database
    console.log(`[DeviceTokenCache] Querying database for user ${userId}`);
    
    let whereClause = "user_id = :userId";
    const replacements = { userId };

    if (deviceType) {
      whereClause += " AND device_type = :deviceType";
      replacements.deviceType = deviceType;
    }

    const tokens = await sequelize.query(
      `SELECT token, device_type, created_at FROM user_device_tokens WHERE ${whereClause}`,
      { 
        replacements,
        type: sequelize.QueryTypes.SELECT 
      }
    );

    // Cache the result for future requests
    await cacheDeviceTokens(userId, tokens);

    // Filter by device type if specified (for return value)
    if (deviceType) {
      return tokens.filter(token => token.device_type === deviceType);
    }

    return tokens;

  } catch (error) {
    console.error("[DeviceTokenCache] Error getting device tokens:", error.message);
    return [];
  }
}

// ─── Invalidate Cache ─────────────────────────────────────────────────────────

/**
 * Invalidate cached device tokens for a user (when tokens are updated)
 * 
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Success status
 */
export async function invalidateDeviceTokenCache(userId) {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    const key = getTokenCacheKey(userId);
    const result = await redis.del(key);
    
    console.log(`[DeviceTokenCache] Invalidated cache for user ${userId}`);
    return result > 0;

  } catch (error) {
    console.error("[DeviceTokenCache] Error invalidating cache:", error.message);
    return false;
  }
}

// ─── Batch Cache Multiple Users ───────────────────────────────────────────────

/**
 * Cache device tokens for multiple users (for bulk operations)
 * 
 * @param {Array} userTokens - Array of {userId, tokens} objects
 * @returns {Promise<number>} Number of users cached successfully
 */
export async function batchCacheDeviceTokens(userTokens) {
  if (!isRedisAvailable()) {
    return 0;
  }

  let cached = 0;

  try {
    const pipeline = redis.pipeline();

    for (const { userId, tokens } of userTokens) {
      const key = getTokenCacheKey(userId);
      const tokenData = JSON.stringify(tokens);
      pipeline.set(key, tokenData, "EX", CACHE_TTL_SECONDS);
    }

    const results = await pipeline.exec();
    cached = results.filter(([err, result]) => !err && result === "OK").length;

    console.log(`[DeviceTokenCache] Batch cached tokens for ${cached}/${userTokens.length} users`);
    return cached;

  } catch (error) {
    console.error("[DeviceTokenCache] Batch cache error:", error.message);
    return cached;
  }
}

// ─── Get Cache Stats ──────────────────────────────────────────────────────────

/**
 * Get device token cache statistics
 * 
 * @returns {Promise<Object>} Cache statistics
 */
export async function getDeviceTokenCacheStats() {
  if (!isRedisAvailable()) {
    return { total_cached_users: 0, redis_available: false };
  }

  try {
    let cursor = "0";
    let totalUsers = 0;
    let totalTokens = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "fcm_tokens:*", "COUNT", 100);
      cursor = nextCursor;
      
      totalUsers += keys.length;

      // Count tokens for sampled keys (to avoid performance issues)
      for (const key of keys.slice(0, 10)) {
        try {
          const cached = await redis.get(key);
          if (cached) {
            const tokens = JSON.parse(cached);
            totalTokens += tokens.length;
          }
        } catch (err) {
          // Skip invalid entries
        }
      }
    } while (cursor !== "0");

    return {
      total_cached_users: totalUsers,
      estimated_total_tokens: Math.round(totalTokens * (totalUsers / Math.min(10, totalUsers)) || 0),
      redis_available: true,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error("[DeviceTokenCache] Stats error:", error.message);
    return { total_cached_users: 0, redis_available: false, error: error.message };
  }
}

// ─── Add Device Token ─────────────────────────────────────────────────────

/**
 * Add a device token for a user (stores in DB and invalidates cache)
 * 
 * @param {string} userId - User ID
 * @param {string} token - FCM token
 * @param {string} deviceType - Device type ('mobile', 'web')
 * @returns {Promise<Object>} Result object
 */
export async function addDeviceToken(userId, token, deviceType = "mobile") {
  try {
    // Check if token already exists
    const existing = await sequelize.query(
      `SELECT id FROM user_device_tokens WHERE user_id = :userId AND token = :token`,
      {
        replacements: { userId, token },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (existing.length > 0) {
      console.log(`[DeviceTokenCache] Token already exists for user ${userId}`);
      return { success: true, message: "Token already exists" };
    }

    // Insert new token
    await sequelize.query(
      `INSERT INTO user_device_tokens (id, user_id, token, device_type, created_at) 
       VALUES (gen_random_uuid(), :userId, :token, :deviceType, NOW())`,
      {
        replacements: { userId, token, deviceType },
        type: sequelize.QueryTypes.INSERT,
      }
    );

    // Invalidate cache so next request gets fresh data
    await invalidateDeviceTokenCache(userId);

    console.log(`[DeviceTokenCache] Added token for user ${userId}`);
    return { success: true, message: "Token stored" };

  } catch (error) {
    console.error("[DeviceTokenCache] Error adding token:", error.message);
    return { success: false, error: error.message };
  }
}

// ─── Remove Device Token ──────────────────────────────────────────────────────

/**
 * Remove a device token for a user (removes from DB and invalidates cache)
 * 
 * @param {string} userId - User ID
 * @param {string} token - FCM token to remove
 * @returns {Promise<Object>} Result object
 */
export async function removeDeviceToken(userId, token) {
  try {
    await sequelize.query(
      `DELETE FROM user_device_tokens WHERE user_id = :userId AND token = :token`,
      {
        replacements: { userId, token },
        type: sequelize.QueryTypes.DELETE,
      }
    );

    // Invalidate cache so next request gets fresh data
    await invalidateDeviceTokenCache(userId);

    console.log(`[DeviceTokenCache] Removed token for user ${userId}`);
    return { success: true, message: "Token removed" };

  } catch (error) {
    console.error("[DeviceTokenCache] Error removing token:", error.message);
    return { success: false, error: error.message };
  }
}

export default { 
  cacheDeviceTokens, 
  getCachedDeviceTokens, 
  getDeviceTokens, 
  addDeviceToken,
  removeDeviceToken,
  invalidateDeviceTokenCache, 
  batchCacheDeviceTokens, 
  getDeviceTokenCacheStats 
};