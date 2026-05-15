import redis from "../redis/redis.config.js";
import { acquireRedisLock, releaseRedisLock } from "../redis/utils/redisLock.util.js";

export function withIdempotency({
  keyPrefix,
  ttlMs = 60_000,
  keyBuilder = (req) => req.headers["idempotency-key"],
} = {}) {
  return async function idempotencyMiddleware(req, res, next) {
    if (!redis) return next();

    const rawKey = keyBuilder(req);
    if (!rawKey) {
      return res.status(400).json({
        success: false,
        message: "Missing idempotency key",
      });
    }

    const idemKey = `${keyPrefix}:${rawKey}`;
    const lockKey = `lock:${idemKey}`;
    let lockToken = null;

    try {
      const existing = await redis.get(idemKey);
      if (existing) {
        return res.status(200).json(JSON.parse(existing));
      }

      lockToken = await acquireRedisLock(lockKey, ttlMs);
      if (!lockToken) {
        return res.status(409).json({
          success: false,
          message: "Request with same idempotency key is already processing",
        });
      }

      const originalJson = res.json.bind(res);
      res.json = async (body) => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            await redis.set(idemKey, JSON.stringify(body), "PX", ttlMs);
          }
        } catch (cacheErr) {
          console.warn("[Idempotency] Failed to cache response:", cacheErr.message);
        } finally {
          if (lockToken) {
            await releaseRedisLock(lockKey, lockToken);
            lockToken = null;
          }
        }
        return originalJson(body);
      };

      res.on("close", async () => {
        if (lockToken) {
          await releaseRedisLock(lockKey, lockToken);
          lockToken = null;
        }
      });

      next();
    } catch (error) {
      if (lockToken) {
        await releaseRedisLock(lockKey, lockToken);
      }
      next(error);
    }
  };
}
