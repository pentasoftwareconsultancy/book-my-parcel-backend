/**
 * Detour Cache Service
 *
 * Caches detour estimations in Redis to avoid recalculation.
 * Replaces the previous in-memory Map + PostgreSQL dual-layer approach.
 *
 * Redis key schema:
 *   detour:{routeId}:{pickupLon}:{pickupLat}:{dropLon}:{dropLat}
 *   value: JSON-serialised detour data
 *   TTL:   24 hours (86400 seconds) — same as previous implementation
 */

import redis from "../redis.config.js";

const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_MINUTES || "1440", 10) * 60; // default 24h

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRedisAvailable() {
  return redis !== null && redis.status === "ready";
}

function buildKey(routeId, pickupLon, pickupLat, dropLon, dropLat) {
  return `detour:${routeId}:${pickupLon}:${pickupLat}:${dropLon}:${dropLat}`;
}

// ─── Get cached detour ─────────────────────────────────────────────────────────

/**
 * Retrieve a cached detour estimation from Redis.
 *
 * @returns {Object|null} Cached detour data or null on miss / Redis unavailable
 */
export async function getCachedDetour(routeId, pickupLon, pickupLat, dropLon, dropLat) {
  if (!isRedisAvailable()) {
    console.warn("[DetourCache] Redis unavailable — cache miss");
    return null;
  }

  try {
    const key    = buildKey(routeId, pickupLon, pickupLat, dropLon, dropLat);
    const cached = await redis.get(key);

    if (cached) {
      console.log(`[DetourCache] Cache HIT: ${key}`);
      return JSON.parse(cached);
    }

    console.log(`[DetourCache] Cache MISS: ${key}`);
    return null;
  } catch (error) {
    console.error("[DetourCache] Error reading from Redis:", error.message);
    return null;
  }
}

// ─── Set cached detour ─────────────────────────────────────────────────────────

/**
 * Store a detour estimation in Redis.
 *
 * @param {number} ttlMinutes  Override TTL in minutes (default: CACHE_TTL_MINUTES env or 1440)
 * @returns {boolean} true on success
 */
export async function setCachedDetour(
  routeId,
  pickupLon,
  pickupLat,
  dropLon,
  dropLat,
  detourData,
  ttlMinutes = null
) {
  if (!isRedisAvailable()) {
    console.warn("[DetourCache] Redis unavailable — skipping cache write");
    return false;
  }

  try {
    const key = buildKey(routeId, pickupLon, pickupLat, dropLon, dropLat);
    const ttl = ttlMinutes ? ttlMinutes * 60 : CACHE_TTL_SECONDS;

    await redis.set(key, JSON.stringify(detourData), "EX", ttl);
    console.log(`[DetourCache] Cache SET: ${key} (TTL ${ttl}s)`);
    return true;
  } catch (error) {
    console.error("[DetourCache] Error writing to Redis:", error.message);
    return false;
  }
}

// ─── Invalidate cache for a route ─────────────────────────────────────────────

/**
 * Delete all cached detour entries for a given routeId.
 * Called when a route is updated.
 *
 * @returns {boolean} true on success
 */
export async function invalidateCache(routeId) {
  if (!isRedisAvailable()) {
    console.warn("[DetourCache] Redis unavailable — cannot invalidate cache");
    return false;
  }

  try {
    // Use SCAN to find all keys matching detour:{routeId}:*
    const pattern = `detour:${routeId}:*`;
    let cursor     = "0";
    let deleted    = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== "0");

    console.log(`[DetourCache] Invalidated ${deleted} cache entries for route: ${routeId}`);
    return true;
  } catch (error) {
    console.error("[DetourCache] Error invalidating cache:", error.message);
    return false;
  }
}

// ─── Get cache stats ───────────────────────────────────────────────────────────

/**
 * Return basic Redis cache stats for monitoring.
 *
 * @returns {Object|null}
 */
export async function getCacheStats() {
  if (!isRedisAvailable()) {
    console.warn("[DetourCache] Redis unavailable — cannot get stats");
    return null;
  }

  try {
    // Count all detour keys
    let cursor    = "0";
    let total     = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "detour:*", "COUNT", 100);
      cursor = nextCursor;
      total += keys.length;
    } while (cursor !== "0");

    const info = await redis.info("memory");
    const usedMemoryMatch = info.match(/used_memory_human:(.+)/);
    const usedMemory = usedMemoryMatch ? usedMemoryMatch[1].trim() : "unknown";

    console.log(`[DetourCache] Stats: ${total} entries in Redis, memory: ${usedMemory}`);

    return {
      total_entries: total,
      redis_memory:  usedMemory,
    };
  } catch (error) {
    console.error("[DetourCache] Error getting stats:", error.message);
    return null;
  }
}

// ─── Get cache hit rate (stub — Redis doesn't track per-key hits natively) ────

/**
 * Returns 0 — per-key hit tracking requires application-level counters.
 * Kept for API compatibility with previous implementation.
 */
export async function getCacheHitRate() {
  return 0;
}

/**
 * Kept for API compatibility — no-op in Redis implementation.
 * Redis TTL handles expiry automatically.
 */
export async function clearExpiredCache() {
  console.log("[DetourCache] clearExpiredCache: Redis handles TTL expiry automatically");
  return 0;
}

/**
 * Kept for API compatibility — no-op in Redis implementation.
 * Actual detour data is stored in the main cache entry.
 */
export async function updateActualDetour(
  routeId, pickupLon, pickupLat, dropLon, dropLat, actualDetourKm
) {
  if (!isRedisAvailable()) return false;

  try {
    const key    = buildKey(routeId, pickupLon, pickupLat, dropLon, dropLat);
    const cached = await redis.get(key);
    if (!cached) return false;

    const data = JSON.parse(cached);
    data.actual_detour_km = actualDetourKm;

    // Preserve remaining TTL
    const ttl = await redis.ttl(key);
    await redis.set(key, JSON.stringify(data), "EX", ttl > 0 ? ttl : CACHE_TTL_SECONDS);

    console.log(`[DetourCache] Updated actual_detour_km for route: ${routeId}`);
    return true;
  } catch (error) {
    console.error("[DetourCache] Error updating actual detour:", error.message);
    return false;
  }
}

export default {
  getCachedDetour,
  setCachedDetour,
  invalidateCache,
  getCacheStats,
  getCacheHitRate,
  clearExpiredCache,
  updateActualDetour,
};
