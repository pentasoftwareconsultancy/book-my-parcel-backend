/**
 * Notification Count Cache Service
 * 
 * Caches unread notification counts per user.
 * Displayed on every page load, invalidated on new notification.
 * 
 * Redis key schema:
 *   notification:count:{user_id} → unread count (TTL: 5 minutes)
 */

import redis from "../redis.config.js";
import sequelize from "../../config/database.config.js";

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

function isRedisAvailable() {
  return redis !== null && redis.status === "ready";
}

function getCountCacheKey(userId) {
  return `notification:count:${userId}`;
}

// ─── Cache Notification Count ─────────────────────────────────────────────────

export async function cacheNotificationCount(userId, count) {
  if (!isRedisAvailable()) return false;

  try {
    const key = getCountCacheKey(userId);
    await redis.set(key, count.toString(), "EX", CACHE_TTL_SECONDS);
    
    console.log(`[NotificationCountCache] Cached count for user ${userId}: ${count}`);
    return true;
  } catch (error) {
    console.error("[NotificationCountCache] Error caching count:", error.message);
    return false;
  }
}

// ─── Get Cached Notification Count ───────────────────────────────────────────

export async function getCachedNotificationCount(userId) {
  if (!isRedisAvailable()) return null;

  try {
    const key = getCountCacheKey(userId);
    const cached = await redis.get(key);
    
    if (cached !== null) {
      console.log(`[NotificationCountCache] Cache HIT for user ${userId}: ${cached}`);
      return parseInt(cached, 10);
    }

    console.log(`[NotificationCountCache] Cache MISS for user ${userId}`);
    return null;
  } catch (error) {
    console.error("[NotificationCountCache] Error getting cached count:", error.message);
    return null;
  }
}

// ─── Get Notification Count (with caching) ────────────────────────────────────

export async function getNotificationCount(userId) {
  try {
    const cached = await getCachedNotificationCount(userId);
    if (cached !== null) return cached;

    console.log(`[NotificationCountCache] Querying database for user ${userId}`);
    
    const result = await sequelize.query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = :userId AND is_read = false`,
      { 
        replacements: { userId },
        type: sequelize.QueryTypes.SELECT 
      }
    );

    const count = result[0]?.count || 0;
    await cacheNotificationCount(userId, count);

    return count;
  } catch (error) {
    console.error("[NotificationCountCache] Error getting count:", error.message);
    return 0;
  }
}

// ─── Increment Notification Count ─────────────────────────────────────────────

export async function incrementNotificationCount(userId) {
  if (!isRedisAvailable()) {
    return await getNotificationCount(userId);
  }

  try {
    const key = getCountCacheKey(userId);
    const newCount = await redis.incr(key);
    await redis.expire(key, CACHE_TTL_SECONDS);
    
    console.log(`[NotificationCountCache] Incremented count for user ${userId}: ${newCount}`);
    return newCount;
  } catch (error) {
    console.error("[NotificationCountCache] Error incrementing count:", error.message);
    return await getNotificationCount(userId);
  }
}

// ─── Decrement Notification Count ─────────────────────────────────────────────

export async function decrementNotificationCount(userId) {
  if (!isRedisAvailable()) {
    return await getNotificationCount(userId);
  }

  try {
    const key = getCountCacheKey(userId);
    const newCount = await redis.decr(key);
    
    // Don't let it go negative
    if (newCount < 0) {
      await redis.set(key, "0", "EX", CACHE_TTL_SECONDS);
      return 0;
    }
    
    await redis.expire(key, CACHE_TTL_SECONDS);
    
    console.log(`[NotificationCountCache] Decremented count for user ${userId}: ${newCount}`);
    return newCount;
  } catch (error) {
    console.error("[NotificationCountCache] Error decrementing count:", error.message);
    return await getNotificationCount(userId);
  }
}

// ─── Invalidate Notification Count ───────────────────────────────────────────

export async function invalidateNotificationCount(userId) {
  if (!isRedisAvailable()) return false;

  try {
    const key = getCountCacheKey(userId);
    await redis.del(key);
    
    console.log(`[NotificationCountCache] Invalidated count for user ${userId}`);
    return true;
  } catch (error) {
    console.error("[NotificationCountCache] Error invalidating count:", error.message);
    return false;
  }
}

export default { 
  cacheNotificationCount, 
  getCachedNotificationCount, 
  getNotificationCount,
  incrementNotificationCount,
  decrementNotificationCount,
  invalidateNotificationCount
};
