/**
 * KYC Status Cache Service
 * 
 * Caches traveller KYC approval status.
 * Checked on every route creation and booking.
 * 
 * Redis key schema:
 *   kyc:status:{traveller_id} → status string (TTL: 1 hour)
 *   kyc:full:{traveller_id} → JSON KYC data (TTL: 1 hour)
 */

import redis from "../redis.config.js";
import sequelize from "../../config/database.config.js";

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour

function isRedisAvailable() {
  return redis !== null && redis.status === "ready";
}

function getKycStatusKey(travellerId) {
  return `kyc:status:${travellerId}`;
}

function getKycFullKey(travellerId) {
  return `kyc:full:${travellerId}`;
}

// ─── Cache KYC Status ─────────────────────────────────────────────────────────

export async function cacheKycStatus(travellerId, status) {
  if (!isRedisAvailable()) return false;

  try {
    const key = getKycStatusKey(travellerId);
    await redis.set(key, status, "EX", CACHE_TTL_SECONDS);
    
    console.log(`[KycStatusCache] Cached status for traveller ${travellerId}: ${status}`);
    return true;
  } catch (error) {
    console.error("[KycStatusCache] Error caching status:", error.message);
    return false;
  }
}

// ─── Get Cached KYC Status ────────────────────────────────────────────────────

export async function getCachedKycStatus(travellerId) {
  if (!isRedisAvailable()) return null;

  try {
    const key = getKycStatusKey(travellerId);
    const cached = await redis.get(key);
    
    if (cached) {
      console.log(`[KycStatusCache] Cache HIT for traveller ${travellerId}`);
      return cached;
    }

    console.log(`[KycStatusCache] Cache MISS for traveller ${travellerId}`);
    return null;
  } catch (error) {
    console.error("[KycStatusCache] Error getting cached status:", error.message);
    return null;
  }
}

// ─── Get KYC Status (with caching) ────────────────────────────────────────────

export async function getKycStatus(travellerId) {
  try {
    const cached = await getCachedKycStatus(travellerId);
    if (cached) return cached;

    console.log(`[KycStatusCache] Querying database for traveller ${travellerId}`);
    
    const result = await sequelize.query(
      `SELECT kyc_status FROM traveller_kyc WHERE traveller_id = :travellerId`,
      { 
        replacements: { travellerId },
        type: sequelize.QueryTypes.SELECT 
      }
    );

    if (!result || result.length === 0) return null;

    const status = result[0].kyc_status;
    await cacheKycStatus(travellerId, status);

    return status;
  } catch (error) {
    console.error("[KycStatusCache] Error getting status:", error.message);
    return null;
  }
}

// ─── Cache Full KYC Data ──────────────────────────────────────────────────────

export async function cacheFullKycData(travellerId, kycData) {
  if (!isRedisAvailable()) return false;

  try {
    const key = getKycFullKey(travellerId);
    await redis.set(key, JSON.stringify(kycData), "EX", CACHE_TTL_SECONDS);
    
    // Also cache status separately
    if (kycData.kyc_status) {
      await cacheKycStatus(travellerId, kycData.kyc_status);
    }
    
    console.log(`[KycStatusCache] Cached full KYC for traveller ${travellerId}`);
    return true;
  } catch (error) {
    console.error("[KycStatusCache] Error caching full KYC:", error.message);
    return false;
  }
}

// ─── Get Full KYC Data (with caching) ─────────────────────────────────────────

export async function getFullKycData(travellerId) {
  try {
    if (isRedisAvailable()) {
      const key = getKycFullKey(travellerId);
      const cached = await redis.get(key);
      
      if (cached) {
        console.log(`[KycStatusCache] Cache HIT for full KYC ${travellerId}`);
        return JSON.parse(cached);
      }
    }

    console.log(`[KycStatusCache] Querying database for full KYC ${travellerId}`);
    
    const result = await sequelize.query(
      `SELECT * FROM traveller_kyc WHERE traveller_id = :travellerId`,
      { 
        replacements: { travellerId },
        type: sequelize.QueryTypes.SELECT 
      }
    );

    if (!result || result.length === 0) return null;

    const kycData = result[0];
    await cacheFullKycData(travellerId, kycData);

    return kycData;
  } catch (error) {
    console.error("[KycStatusCache] Error getting full KYC:", error.message);
    return null;
  }
}

// ─── Invalidate KYC Cache ─────────────────────────────────────────────────────

export async function invalidateKycCache(travellerId) {
  if (!isRedisAvailable()) return false;

  try {
    await redis.del(getKycStatusKey(travellerId));
    await redis.del(getKycFullKey(travellerId));
    
    console.log(`[KycStatusCache] Invalidated cache for traveller ${travellerId}`);
    return true;
  } catch (error) {
    console.error("[KycStatusCache] Error invalidating cache:", error.message);
    return false;
  }
}

export default { 
  cacheKycStatus, 
  getCachedKycStatus, 
  getKycStatus,
  cacheFullKycData,
  getFullKycData,
  invalidateKycCache
};
