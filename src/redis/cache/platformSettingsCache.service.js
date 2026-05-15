/**
 * Platform Settings Cache Service
 * 
 * Caches platform settings in Redis to reduce database queries.
 * Settings like session timeout, platform fees, max login attempts, etc.
 * 
 * Redis key schema:
 *   settings:{key} → value (TTL: 1 hour)
 *   settings:all → JSON object of all settings (TTL: 1 hour)
 */

import redis from "../redis.config.js";
import sequelize from "../../config/database.config.js";

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRedisAvailable() {
  return redis !== null && redis.status === "ready";
}

function getSettingKey(key) {
  return `settings:${key}`;
}

function getAllSettingsKey() {
  return "settings:all";
}

// ─── Cache Individual Setting ─────────────────────────────────────────────────

/**
 * Cache a single platform setting
 * 
 * @param {string} key - Setting key
 * @param {string} value - Setting value
 * @returns {Promise<boolean>} Success status
 */
export async function cacheSetting(key, value) {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    const cacheKey = getSettingKey(key);
    await redis.set(cacheKey, value, "EX", CACHE_TTL_SECONDS);
    
    console.log(`[SettingsCache] Cached setting: ${key} = ${value}`);
    return true;

  } catch (error) {
    console.error("[SettingsCache] Error caching setting:", error.message);
    return false;
  }
}

// ─── Get Cached Setting ───────────────────────────────────────────────────────

/**
 * Get a cached platform setting
 * 
 * @param {string} key - Setting key
 * @returns {Promise<string|null>} Cached value or null if not found
 */
export async function getCachedSetting(key) {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    const cacheKey = getSettingKey(key);
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      console.log(`[SettingsCache] Cache HIT: ${key} = ${cached}`);
      return cached;
    }

    console.log(`[SettingsCache] Cache MISS: ${key}`);
    return null;

  } catch (error) {
    console.error("[SettingsCache] Error getting cached setting:", error.message);
    return null;
  }
}

// ─── Get Setting (with caching) ───────────────────────────────────────────────

/**
 * Get a platform setting (checks cache first, then database)
 * 
 * @param {string} key - Setting key
 * @param {string} defaultValue - Default value if not found
 * @returns {Promise<string>} Setting value
 */
export async function getSetting(key, defaultValue = null) {
  try {
    // Try cache first
    const cached = await getCachedSetting(key);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - query database
    console.log(`[SettingsCache] Querying database for setting: ${key}`);
    
    const result = await sequelize.query(
      `SELECT value FROM platform_settings WHERE key = :key`,
      { 
        replacements: { key },
        type: sequelize.QueryTypes.SELECT 
      }
    );

    const value = result[0]?.value || defaultValue;

    // Cache the result
    if (value !== null) {
      await cacheSetting(key, value);
    }

    return value;

  } catch (error) {
    console.error("[SettingsCache] Error getting setting:", error.message);
    return defaultValue;
  }
}

// ─── Cache All Settings ───────────────────────────────────────────────────────

/**
 * Cache all platform settings as a single JSON object
 * 
 * @returns {Promise<Object|null>} All settings object or null on error
 */
export async function cacheAllSettings() {
  try {
    // Query all settings from database
    const results = await sequelize.query(
      `SELECT key, value FROM platform_settings`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const settings = {};
    for (const { key, value } of results) {
      settings[key] = value;
    }

    if (isRedisAvailable()) {
      // Cache individual settings
      const pipeline = redis.pipeline();
      for (const [key, value] of Object.entries(settings)) {
        pipeline.set(getSettingKey(key), value, "EX", CACHE_TTL_SECONDS);
      }

      // Cache all settings as JSON
      pipeline.set(getAllSettingsKey(), JSON.stringify(settings), "EX", CACHE_TTL_SECONDS);
      
      await pipeline.exec();
      
      console.log(`[SettingsCache] Cached ${Object.keys(settings).length} platform settings`);
    }

    return settings;

  } catch (error) {
    console.error("[SettingsCache] Error caching all settings:", error.message);
    return null;
  }
}

// ─── Get All Settings (with caching) ──────────────────────────────────────────

/**
 * Get all platform settings (checks cache first, then database)
 * 
 * @returns {Promise<Object>} All settings object
 */
export async function getAllSettings() {
  try {
    // Try cache first
    if (isRedisAvailable()) {
      const cached = await redis.get(getAllSettingsKey());
      if (cached) {
        const settings = JSON.parse(cached);
        console.log(`[SettingsCache] Cache HIT: ${Object.keys(settings).length} settings`);
        return settings;
      }
    }

    // Cache miss - query and cache all settings
    console.log("[SettingsCache] Cache MISS - loading all settings from database");
    return await cacheAllSettings() || {};

  } catch (error) {
    console.error("[SettingsCache] Error getting all settings:", error.message);
    return {};
  }
}

// ─── Invalidate Settings Cache ────────────────────────────────────────────────

/**
 * Invalidate settings cache (when settings are updated)
 * 
 * @param {string} key - Specific setting key to invalidate, or null for all
 * @returns {Promise<boolean>} Success status
 */
export async function invalidateSettingsCache(key = null) {
  if (!isRedisAvailable()) {
    return false;
  }

  try {
    if (key) {
      // Invalidate specific setting
      const cacheKey = getSettingKey(key);
      await redis.del(cacheKey);
      console.log(`[SettingsCache] Invalidated cache for setting: ${key}`);
    } else {
      // Invalidate all settings
      let cursor = "0";
      let deleted = 0;

      do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "settings:*", "COUNT", 100);
        cursor = nextCursor;

        if (keys.length > 0) {
          await redis.del(...keys);
          deleted += keys.length;
        }
      } while (cursor !== "0");

      console.log(`[SettingsCache] Invalidated ${deleted} cached settings`);
    }

    return true;

  } catch (error) {
    console.error("[SettingsCache] Error invalidating cache:", error.message);
    return false;
  }
}

// ─── Common Settings Helpers ──────────────────────────────────────────────────

/**
 * Get session timeout in minutes (with caching)
 */
export async function getSessionTimeout(isAdmin = false) {
  const key = isAdmin ? 'admin_session_timeout_mins' : 'session_timeout_mins';
  const defaultValue = isAdmin ? '60' : '30';
  const value = await getSetting(key, defaultValue);
  return parseInt(value) || parseInt(defaultValue);
}

/**
 * Get max login attempts (with caching)
 */
export async function getMaxLoginAttempts() {
  const value = await getSetting('max_login_attempts', '5');
  return parseInt(value) || 5;
}

/**
 * Get platform fee percentage (with caching)
 */
export async function getPlatformFeePercent() {
  const value = await getSetting('platform_fee_percent', '10');
  return parseFloat(value) || 10;
}

// ─── Get Cache Stats ──────────────────────────────────────────────────────────

/**
 * Get settings cache statistics
 * 
 * @returns {Promise<Object>} Cache statistics
 */
export async function getSettingsCacheStats() {
  if (!isRedisAvailable()) {
    return { total_cached_settings: 0, redis_available: false };
  }

  try {
    let cursor = "0";
    let totalSettings = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "settings:*", "COUNT", 100);
      cursor = nextCursor;
      totalSettings += keys.length;
    } while (cursor !== "0");

    return {
      total_cached_settings: totalSettings,
      redis_available: true,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error("[SettingsCache] Stats error:", error.message);
    return { total_cached_settings: 0, redis_available: false, error: error.message };
  }
}

export default { 
  cacheSetting, 
  getCachedSetting, 
  getSetting, 
  cacheAllSettings, 
  getAllSettings, 
  invalidateSettingsCache,
  getSessionTimeout,
  getMaxLoginAttempts,
  getPlatformFeePercent,
  getSettingsCacheStats 
};