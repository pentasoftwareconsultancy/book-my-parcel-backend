/**
 * BullMQ Redis Connection Factory
 *
 * BullMQ must NEVER share the main redis instance.
 * It uses blocking commands (BRPOP, XREAD BLOCK) that hold the connection
 * and cause all other Redis operations to timeout.
 *
 * This factory creates a fresh ioredis instance from the same URL/config
 * but with lazyConnect:true so BullMQ controls the connection lifecycle.
 */

import { Redis } from "ioredis";

const REDIS_URL  = process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = process.env.REDIS_PORT;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

export function createBullMQConnection() {
  if (!REDIS_URL && !REDIS_HOST) return null;

  try {
    if (REDIS_URL) {
      const isTLS = REDIS_URL.startsWith("rediss://");
      return new Redis(REDIS_URL, {
        maxRetriesPerRequest: null, // required by BullMQ
        enableReadyCheck:     false,
        lazyConnect:          true, // BullMQ manages connect/disconnect
        connectTimeout:       15000,
        ...(isTLS ? { tls: { rejectUnauthorized: false } } : {}),
        retryStrategy: (times) => {
          if (times > 6) return null;
          return Math.min(200 * Math.pow(2, times - 1), 3000);
        },
      });
    }

    return new Redis({
      host:                 REDIS_HOST,
      port:                 parseInt(REDIS_PORT || "6379", 10),
      password:             REDIS_PASSWORD,
      maxRetriesPerRequest: null,
      enableReadyCheck:     false,
      lazyConnect:          true,
    });
  } catch (err) {
    console.warn("[BullMQ] Failed to create Redis connection:", err.message);
    return null;
  }
}
