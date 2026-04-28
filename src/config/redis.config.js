/**
 * Redis connection config for BullMQ.
 *
 * Uses REDIS_URL (full connection string) if set — preferred for cloud (Render, Railway, etc.)
 * Falls back to individual REDIS_HOST / REDIS_PORT / REDIS_PASSWORD env vars for local dev.
 * If neither is configured, returns null so callers can skip queue features gracefully.
 */

import { Redis } from "ioredis";

let redis = null;

const REDIS_URL      = process.env.REDIS_URL;
const REDIS_HOST     = process.env.REDIS_HOST     || "127.0.0.1";
const REDIS_PORT     = parseInt(process.env.REDIS_PORT || "6379", 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

try {
  if (REDIS_URL) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    });
  } else {
    redis = new Redis({
      host:     REDIS_HOST,
      port:     REDIS_PORT,
      password: REDIS_PASSWORD,
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    });
  }

  redis.on("connect",       () => console.log("✅ Redis connected"));
  redis.on("error",  (err) => console.warn("⚠️  Redis error (non-fatal):", err.message));
  redis.on("close",        () => console.warn("⚠️  Redis connection closed"));

} catch (err) {
  console.warn("⚠️  Redis init failed — notification queue disabled:", err.message);
  redis = null;
}

export default redis;
