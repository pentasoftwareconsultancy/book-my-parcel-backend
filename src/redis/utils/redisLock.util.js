import crypto from "crypto";
import redis from "../redis.config.js";

export async function acquireRedisLock(lockKey, ttlMs = 60_000) {
  if (!redis) return null;

  const token = crypto.randomUUID();
  const result = await redis.set(lockKey, token, "PX", ttlMs, "NX");
  return result === "OK" ? token : null;
}

export async function releaseRedisLock(lockKey, token) {
  if (!redis || !token) return false;

  const releaseScript = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  const result = await redis.eval(releaseScript, 1, lockKey, token);
  return result === 1;
}
