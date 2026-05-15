/**
 * Simple Redis cache utility with TTL.
 * Falls back gracefully if Redis is not configured.
 */
import redis from "../redis/redis.config.js";

const DEFAULT_TTL = 300; // 5 minutes

export async function cacheGet(key) {
  if (!redis) return null;
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    console.warn("[Cache] GET failed (non-fatal):", err.message);
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = DEFAULT_TTL) {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    console.warn("[Cache] SET failed (non-fatal):", err.message);
  }
}

export async function cacheDel(key) {
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (err) {
    console.warn("[Cache] DEL failed (non-fatal):", err.message);
  }
}

export async function getOrCache(key, fetchFn, ttlSeconds = DEFAULT_TTL) {
  const cached = await cacheGet(key);
  if (cached !== null) return cached;
  const fresh = await fetchFn();
  await cacheSet(key, fresh, ttlSeconds);
  return fresh;
}
