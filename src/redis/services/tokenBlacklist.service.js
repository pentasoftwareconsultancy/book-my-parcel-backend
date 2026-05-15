/**
 * JWT Token Blacklist Service
 * 
 * Manages blacklisted JWT tokens in Redis for secure logout functionality.
 * When a user logs out, their token is added to the blacklist until it expires.
 * 
 * Redis key schema:
 *   blacklist:{token_hash} → user_id (TTL: remaining token lifetime)
 */

import crypto from "crypto";
import jwt from "jsonwebtoken";
import redis from "../redis.config.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRedisAvailable() {
  return redis !== null && redis.status === "ready";
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getTokenKey(tokenHash) {
  return `blacklist:${tokenHash}`;
}

// ─── Blacklist Token ──────────────────────────────────────────────────────────

/**
 * Add a JWT token to the blacklist (for logout)
 * 
 * @param {string} token - The JWT token to blacklist
 * @param {string} userId - The user ID (for logging)
 * @returns {Promise<boolean>} Success status
 */
export async function blacklistToken(token, userId) {
  if (!isRedisAvailable()) {
    console.warn("[TokenBlacklist] Redis unavailable - token not blacklisted");
    return false;
  }

  try {
    // Decode token to get expiration time
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      console.warn("[TokenBlacklist] Invalid token - cannot blacklist");
      return false;
    }

    // Calculate remaining TTL
    const now = Math.floor(Date.now() / 1000);
    const ttl = decoded.exp - now;

    if (ttl <= 0) {
      console.log("[TokenBlacklist] Token already expired - no need to blacklist");
      return true;
    }

    // Hash token and store in Redis
    const tokenHash = hashToken(token);
    const key = getTokenKey(tokenHash);
    
    await redis.set(key, userId, "EX", ttl);
    
    console.log(`[TokenBlacklist] Token blacklisted for user ${userId} (TTL: ${ttl}s)`);
    return true;

  } catch (error) {
    console.error("[TokenBlacklist] Error blacklisting token:", error.message);
    return false;
  }
}

// ─── Check Token Blacklist ────────────────────────────────────────────────────

/**
 * Check if a JWT token is blacklisted
 * 
 * @param {string} token - The JWT token to check
 * @returns {Promise<boolean>} True if blacklisted, false if valid
 */
export async function isTokenBlacklisted(token) {
  if (!isRedisAvailable()) {
    // If Redis is down, allow the token (fail open for availability)
    console.warn("[TokenBlacklist] Redis unavailable - allowing token");
    return false;
  }

  try {
    const tokenHash = hashToken(token);
    const key = getTokenKey(tokenHash);
    
    const result = await redis.get(key);
    
    if (result) {
      console.log(`[TokenBlacklist] Token is blacklisted for user ${result}`);
      return true;
    }

    return false;

  } catch (error) {
    console.error("[TokenBlacklist] Error checking blacklist:", error.message);
    // Fail open - allow token if we can't check
    return false;
  }
}

// ─── Cleanup Expired Tokens ───────────────────────────────────────────────────

/**
 * Clean up expired blacklist entries (optional - Redis TTL handles this automatically)
 * This is mainly for monitoring/stats purposes
 * 
 * @returns {Promise<number>} Number of entries cleaned up
 */
export async function cleanupExpiredTokens() {
  if (!isRedisAvailable()) {
    return 0;
  }

  try {
    let cursor = "0";
    let cleaned = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "blacklist:*", "COUNT", 100);
      cursor = nextCursor;

      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl === -2) { // Key doesn't exist (expired)
          cleaned++;
        }
      }
    } while (cursor !== "0");

    if (cleaned > 0) {
      console.log(`[TokenBlacklist] Cleanup complete - ${cleaned} expired entries`);
    }

    return cleaned;

  } catch (error) {
    console.error("[TokenBlacklist] Cleanup error:", error.message);
    return 0;
  }
}

// ─── Get Blacklist Stats ──────────────────────────────────────────────────────

/**
 * Get blacklist statistics
 * 
 * @returns {Promise<Object>} Blacklist stats
 */
export async function getBlacklistStats() {
  if (!isRedisAvailable()) {
    return { total: 0, redis_available: false };
  }

  try {
    let cursor = "0";
    let total = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "blacklist:*", "COUNT", 100);
      cursor = nextCursor;
      total += keys.length;
    } while (cursor !== "0");

    return {
      total,
      redis_available: true,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error("[TokenBlacklist] Stats error:", error.message);
    return { total: 0, redis_available: false, error: error.message };
  }
}

export default { blacklistToken, isTokenBlacklisted, cleanupExpiredTokens, getBlacklistStats };