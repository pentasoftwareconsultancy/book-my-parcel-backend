/**
 * Parcel Request Cache Service
 * 
 * Caches active parcel requests for matching engine.
 * Reduces database queries during route-parcel matching.
 * 
 * Redis key schema:
 *   parcel:request:{request_id} → JSON request data (TTL: 30 minutes)
 *   parcels:active → Set of active request IDs (TTL: 30 minutes)
 *   parcels:user:{user_id} → Set of request IDs for user (TTL: 30 minutes)
 */

import redis from "../redis.config.js";
import sequelize from "../../config/database.config.js";

const CACHE_TTL_SECONDS = 30 * 60; // 30 minutes

function isRedisAvailable() {
  return redis !== null && redis.status === "ready";
}

function getRequestCacheKey(requestId) {
  return `parcel:request:${requestId}`;
}

function getActiveRequestsKey() {
  return "parcels:active";
}

function getUserRequestsKey(userId) {
  return `parcels:user:${userId}`;
}

// ─── Cache Parcel Request ─────────────────────────────────────────────────────

export async function cacheParcelRequest(requestId, requestData) {
  if (!isRedisAvailable()) return false;

  try {
    const key = getRequestCacheKey(requestId);
    await redis.set(key, JSON.stringify(requestData), "EX", CACHE_TTL_SECONDS);
    
    if (requestData.status === "PENDING") {
      await redis.sadd(getActiveRequestsKey(), requestId);
      await redis.expire(getActiveRequestsKey(), CACHE_TTL_SECONDS);
      
      if (requestData.user_id) {
        await redis.sadd(getUserRequestsKey(requestData.user_id), requestId);
        await redis.expire(getUserRequestsKey(requestData.user_id), CACHE_TTL_SECONDS);
      }
    }
    
    console.log(`[ParcelRequestCache] Cached request ${requestId}`);
    return true;
  } catch (error) {
    console.error("[ParcelRequestCache] Error caching:", error.message);
    return false;
  }
}

// ─── Get Cached Parcel Request ────────────────────────────────────────────────

export async function getCachedParcelRequest(requestId) {
  if (!isRedisAvailable()) return null;

  try {
    const key = getRequestCacheKey(requestId);
    const cached = await redis.get(key);
    
    if (cached) {
      console.log(`[ParcelRequestCache] Cache HIT for request ${requestId}`);
      return JSON.parse(cached);
    }

    console.log(`[ParcelRequestCache] Cache MISS for request ${requestId}`);
    return null;
  } catch (error) {
    console.error("[ParcelRequestCache] Error getting cached:", error.message);
    return null;
  }
}

// ─── Get Parcel Request (with caching) ────────────────────────────────────────

export async function getParcelRequest(requestId) {
  try {
    const cached = await getCachedParcelRequest(requestId);
    if (cached) return cached;

    console.log(`[ParcelRequestCache] Querying database for request ${requestId}`);
    
    const result = await sequelize.query(
      `SELECT * FROM parcel_requests WHERE id = :requestId`,
      { 
        replacements: { requestId },
        type: sequelize.QueryTypes.SELECT 
      }
    );

    if (!result || result.length === 0) return null;

    const requestData = result[0];
    await cacheParcelRequest(requestId, requestData);

    return requestData;
  } catch (error) {
    console.error("[ParcelRequestCache] Error getting request:", error.message);
    return null;
  }
}

// ─── Get Active Parcel Requests ───────────────────────────────────────────────

export async function getActiveParcelRequests() {
  try {
    if (isRedisAvailable()) {
      const requestIds = await redis.smembers(getActiveRequestsKey());
      
      if (requestIds && requestIds.length > 0) {
        console.log(`[ParcelRequestCache] Cache HIT: ${requestIds.length} active requests`);
        
        const pipeline = redis.pipeline();
        requestIds.forEach(id => pipeline.get(getRequestCacheKey(id)));
        const results = await pipeline.exec();
        
        const requests = results
          .filter(([err, data]) => !err && data)
          .map(([, data]) => JSON.parse(data));
        
        if (requests.length === requestIds.length) return requests;
      }
    }

    console.log("[ParcelRequestCache] Querying database for active requests");
    
    const requests = await sequelize.query(
      `SELECT * FROM parcel_requests WHERE status = 'PENDING' ORDER BY created_at DESC`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (isRedisAvailable() && requests.length > 0) {
      const pipeline = redis.pipeline();
      
      requests.forEach(req => {
        pipeline.set(getRequestCacheKey(req.id), JSON.stringify(req), "EX", CACHE_TTL_SECONDS);
        pipeline.sadd(getActiveRequestsKey(), req.id);
      });
      
      pipeline.expire(getActiveRequestsKey(), CACHE_TTL_SECONDS);
      await pipeline.exec();
      
      console.log(`[ParcelRequestCache] Cached ${requests.length} active requests`);
    }

    return requests;
  } catch (error) {
    console.error("[ParcelRequestCache] Error getting active requests:", error.message);
    return [];
  }
}

// ─── Invalidate Parcel Request Cache ──────────────────────────────────────────

export async function invalidateParcelRequestCache(requestId, userId = null) {
  if (!isRedisAvailable()) return false;

  try {
    const key = getRequestCacheKey(requestId);
    await redis.del(key);
    await redis.srem(getActiveRequestsKey(), requestId);
    
    if (userId) {
      await redis.srem(getUserRequestsKey(userId), requestId);
    }
    
    console.log(`[ParcelRequestCache] Invalidated cache for request ${requestId}`);
    return true;
  } catch (error) {
    console.error("[ParcelRequestCache] Error invalidating cache:", error.message);
    return false;
  }
}

export default { 
  cacheParcelRequest, 
  getCachedParcelRequest, 
  getParcelRequest,
  getActiveParcelRequests,
  invalidateParcelRequestCache
};
