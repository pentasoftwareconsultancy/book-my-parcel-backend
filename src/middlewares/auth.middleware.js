import jwt from "jsonwebtoken";
import User from "../modules/user/user.model.js";
import { cacheGet, cacheSet, cacheDel } from "../utils/cache.util.js";
import { isTokenBlacklisted } from "../redis/services/tokenBlacklist.service.js";

// Cache TTL for user existence checks — 5 minutes.
// Short enough that a deleted/banned user is blocked within 5 min.
// Long enough to eliminate the DB hit on every request.
const USER_CACHE_TTL = 300;

/**
 * Build the Redis key for a cached user record.
 * Exported so other services (updateProfile, updatePassword) can invalidate it.
 */
export function userCacheKey(userId) {
  return `auth:user:${userId}`;
}

/**
 * Invalidate the cached user record.
 * Call this whenever user data changes (profile update, password change, ban, etc.)
 * so the next request re-fetches from the DB.
 */
export async function invalidateUserCache(userId) {
  await cacheDel(userCacheKey(userId));
}

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader)
      return res.status(401).json({ error: "No token provided" });

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // Check if token has been blacklisted (logged out) — non-blocking
    // If Redis is down/slow, fail open (allow request) rather than blocking all traffic
    try {
      if (await isTokenBlacklisted(token)) {
        return res.status(401).json({ error: "Token has been invalidated. Please log in again." });
      }
    } catch (blacklistErr) {
      // Redis timeout/error — fail open, don't block the request
      console.warn("[Auth] Token blacklist check failed (non-fatal):", blacklistErr.message);
    }

    // ── Cache-first user lookup ───────────────────────────────────────────────
    // Check Redis first. On a cache miss, hit the DB and populate the cache.
    // Falls back to a direct DB query if Redis is unavailable (cache.util.js
    // returns null on Redis errors, so the logic below handles it gracefully).
    const cacheKey = userCacheKey(userId);
    let userExists = await cacheGet(cacheKey);

    if (userExists === null) {
      // Cache miss — query DB
      const user = await User.findByPk(userId, {
        attributes: ["id"], // only need existence check — don't fetch full row
      });

      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      // Store a lightweight marker — we only need to know the user exists.
      // Storing the full user object would risk serving stale profile data.
      await cacheSet(cacheKey, { id: user.id }, USER_CACHE_TTL);
      userExists = { id: user.id };
    }

    req.user = { id: userExists.id };
    next();
  } catch (err) {
    // jwt.verify throws for expired/invalid tokens — return 401, not 500
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    console.error("[Auth] Middleware error:", err.message);
    res.status(401).json({ error: "Authentication failed" });
  }
}
