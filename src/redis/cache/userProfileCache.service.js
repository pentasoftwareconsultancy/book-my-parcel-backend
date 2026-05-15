/**
 * User Profile Cache Service
 * 
 * Caches frequently accessed user profile data in Redis.
 * Reduces database queries on every authenticated request.
 * 
 * Redis key schema:
 *   user:profile:{user_id} → JSON user profile (TTL: 30 minutes)
 */

import redis from "../redis.config.js";
import sequelize from "../../config/database.config.js";

const CACHE_TTL_SECONDS = 30 * 60; // 30 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRedisAvailable() {
  return redis !== null && redis.status === "ready";
}

function getUserCacheKey(userId) {
  return `user:profile:${userId}`;
}

// ─── Cache User Profile ───────────────────────────────────────────────────────

/**
 * Cache user profile data
 * 
 * @param {string} userId - User ID
 * @param {Object} userData - User profile data
 * @returns {Promise<boolean>} Success status
 */
export async function cacheUserProfile(userId, userData) {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    const key = getUserCacheKey(userId);
    await redis.set(key, JSON.stringify(userData), "EX", CACHE_TTL_SECONDS);
    
    console.log(`[UserProfileCache] Cached profile for user ${userId}`);
    return true;

  } catch (error) {
    console.error("[UserProfileCache] Error caching profile:", error.message);
    return false;
  }
}

// ─── Get Cached User Profile ──────────────────────────────────────────────────

/**
 * Get cached user profile
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Cached user data or null
 */
export async function getCachedUserProfile(userId) {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    const key = getUserCacheKey(userId);
    const cached = await redis.get(key);
    
    if (cached) {
      console.log(`[UserProfileCache] Cache HIT for user ${userId}`);
      return JSON.parse(cached);
    }

    console.log(`[UserProfileCache] Cache MISS for user ${userId}`);
    return null;

  } catch (error) {
    console.error("[UserProfileCache] Error getting cached profile:", error.message);
    return null;
  }
}

// ─── Get User Profile (with caching) ──────────────────────────────────────────

/**
 * Get user profile (checks cache first, then database)
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User profile data
 */
export async function getUserProfile(userId) {
  try {
    // Try cache first
    const cached = await getCachedUserProfile(userId);
    if (cached) {
      return cached;
    }

    // Cache miss - query database
    console.log(`[UserProfileCache] Querying database for user ${userId}`);
    
    const result = await sequelize.query(
      `SELECT u.id, u.email, u.phone, u.role, u.is_active, u.created_at,
              up.full_name, up.date_of_birth, up.gender, up.profile_picture_url,
              up.address, up.city, up.state, up.pincode, up.country
       FROM users u
       LEFT JOIN user_profiles up ON u.id = up.user_id
       WHERE u.id = :userId`,
      { 
        replacements: { userId },
        type: sequelize.QueryTypes.SELECT 
      }
    );

    if (!result || result.length === 0) {
      return null;
    }

    const userData = result[0];

    // Cache the result
    await cacheUserProfile(userId, userData);

    return userData;

  } catch (error) {
    console.error("[UserProfileCache] Error getting profile:", error.message);
    return null;
  }
}

// ─── Invalidate User Profile Cache ────────────────────────────────────────────

/**
 * Invalidate cached user profile (when profile is updated)
 * 
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Success status
 */
export async function invalidateUserProfileCache(userId) {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    const key = getUserCacheKey(userId);
    await redis.del(key);
    
    console.log(`[UserProfileCache] Invalidated cache for user ${userId}`);
    return true;

  } catch (error) {
    console.error("[UserProfileCache] Error invalidating cache:", error.message);
    return false;
  }
}

// ─── Batch Cache Multiple Users ───────────────────────────────────────────────

/**
 * Cache profiles for multiple users (for bulk operations)
 * 
 * @param {Array} userProfiles - Array of {userId, userData} objects
 * @returns {Promise<number>} Number of users cached successfully
 */
export async function batchCacheUserProfiles(userProfiles) {
  if (!isRedisAvailable()) {
    return 0;
  }

  let cached = 0;

  try {
    const pipeline = redis.pipeline();

    for (const { userId, userData } of userProfiles) {
      const key = getUserCacheKey(userId);
      pipeline.set(key, JSON.stringify(userData), "EX", CACHE_TTL_SECONDS);
    }

    const results = await pipeline.exec();
    cached = results.filter(([err, result]) => !err && result === "OK").length;

    console.log(`[UserProfileCache] Batch cached ${cached}/${userProfiles.length} user profiles`);
    return cached;

  } catch (error) {
    console.error("[UserProfileCache] Batch cache error:", error.message);
    return cached;
  }
}

export default { 
  cacheUserProfile, 
  getCachedUserProfile, 
  getUserProfile, 
  invalidateUserProfileCache,
  batchCacheUserProfiles
};
