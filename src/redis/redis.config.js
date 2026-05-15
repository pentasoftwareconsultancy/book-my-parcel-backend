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
const REDIS_HOST     = process.env.REDIS_HOST;
const REDIS_PORT     = process.env.REDIS_PORT;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

// Vercel KV (Redis-compatible)
const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

// Only attempt Redis connection if explicitly configured
if (REDIS_URL || REDIS_HOST || KV_REST_API_URL) {
  try {
    if (KV_REST_API_URL && KV_REST_API_TOKEN) {
      // Vercel KV - use REST API approach
      console.log("🔗 Connecting to Vercel KV...");
      redis = new Redis(KV_REST_API_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
      });
    } else if (REDIS_URL) {
      // Upstash uses rediss:// (TLS) — must NOT use lazyConnect so the TLS
      // handshake completes at startup before any commands are issued.
      // lazyConnect defers the connection to the first command, causing a
      // burst of simultaneous commands to queue on a cold TLS socket → timeouts.
      const isTLS = REDIS_URL.startsWith("rediss://");
      redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: false,           // connect immediately at startup
        connectTimeout: 15000,
        commandTimeout: 5000,
        ...(isTLS ? { tls: { rejectUnauthorized: false } } : {}),
        retryStrategy: (times) => {
          if (times > 6) return null;
          return Math.min(200 * Math.pow(2, times - 1), 3000);
        },
      });
    } else {
      redis = new Redis({
        host:     REDIS_HOST,
        port:     parseInt(REDIS_PORT || "6379", 10),
        password: REDIS_PASSWORD,
        maxRetriesPerRequest: null, // required by BullMQ
        enableReadyCheck: false,
      });
    }

    redis.on("connect", () => console.log("✅ Redis connected"));
    redis.on("ready", () => console.log("🚀 Redis ready for commands"));
    redis.on("error", (err) => {
      // Suppress common non-critical errors
      const suppressedErrors = ['ECONNRESET', 'ETIMEDOUT', 'Command timed out', 'ENOTFOUND'];
      const shouldSuppress = suppressedErrors.some(msg => err.message.includes(msg));
      
      if (!shouldSuppress) {
        console.warn("⚠️  Redis error:", err.message);
      }
    });
    redis.on("close", () => {
      // Only log if we're not in a retry cycle
      if (redis.status !== 'connecting') {
        console.warn("⚠️  Redis connection closed");
      }
    });
    redis.on("reconnecting", () => {
      // Suppress reconnecting logs in production
      if (process.env.NODE_ENV !== 'production') {
        console.log("🔄 Redis reconnecting...");
      }
    });

  } catch (err) {
    console.warn("⚠️  Redis init failed — notification queue disabled:", err.message);
    redis = null;
  }
} else {
  console.log("ℹ️  Redis not configured — caching and notifications disabled");
}

export default redis;
