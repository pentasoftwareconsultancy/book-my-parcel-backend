/**
 * Booking Status Cache Service
 * 
 * Caches current booking statuses for dashboard and tracking pages.
 * Invalidated immediately on status changes.
 * 
 * Redis key schema:
 *   booking:status:{booking_id} → status string (TTL: 1 hour)
 *   booking:full:{booking_id} → JSON booking data (TTL: 15 minutes)
 *   bookings:user:{user_id} → Set of booking IDs (TTL: 15 minutes)
 *   bookings:traveller:{traveller_id} → Set of booking IDs (TTL: 15 minutes)
 */

import redis from "../redis.config.js";
import sequelize from "../../config/database.config.js";

const STATUS_TTL_SECONDS = 60 * 60; // 1 hour
const FULL_TTL_SECONDS = 15 * 60; // 15 minutes

function isRedisAvailable() {
  return redis !== null && redis.status === "ready";
}

function getStatusCacheKey(bookingId) {
  return `booking:status:${bookingId}`;
}

function getFullCacheKey(bookingId) {
  return `booking:full:${bookingId}`;
}

function getUserBookingsKey(userId) {
  return `bookings:user:${userId}`;
}

function getTravellerBookingsKey(travellerId) {
  return `bookings:traveller:${travellerId}`;
}

// ─── Cache Booking Status ─────────────────────────────────────────────────────

export async function cacheBookingStatus(bookingId, status) {
  if (!isRedisAvailable()) return false;

  try {
    const key = getStatusCacheKey(bookingId);
    await redis.set(key, status, "EX", STATUS_TTL_SECONDS);
    
    console.log(`[BookingStatusCache] Cached status for booking ${bookingId}: ${status}`);
    return true;
  } catch (error) {
    console.error("[BookingStatusCache] Error caching status:", error.message);
    return false;
  }
}

// ─── Get Cached Booking Status ────────────────────────────────────────────────

export async function getCachedBookingStatus(bookingId) {
  if (!isRedisAvailable()) return null;

  try {
    const key = getStatusCacheKey(bookingId);
    const cached = await redis.get(key);
    
    if (cached) {
      console.log(`[BookingStatusCache] Cache HIT for booking ${bookingId}`);
      return cached;
    }

    console.log(`[BookingStatusCache] Cache MISS for booking ${bookingId}`);
    return null;
  } catch (error) {
    console.error("[BookingStatusCache] Error getting cached status:", error.message);
    return null;
  }
}

// ─── Cache Full Booking ───────────────────────────────────────────────────────

export async function cacheFullBooking(bookingId, bookingData) {
  if (!isRedisAvailable()) return false;

  try {
    const key = getFullCacheKey(bookingId);
    await redis.set(key, JSON.stringify(bookingData), "EX", FULL_TTL_SECONDS);
    
    // Also cache status separately
    await cacheBookingStatus(bookingId, bookingData.status);
    
    // Add to user/traveller sets
    if (bookingData.user_id) {
      await redis.sadd(getUserBookingsKey(bookingData.user_id), bookingId);
      await redis.expire(getUserBookingsKey(bookingData.user_id), FULL_TTL_SECONDS);
    }
    
    if (bookingData.traveller_id) {
      await redis.sadd(getTravellerBookingsKey(bookingData.traveller_id), bookingId);
      await redis.expire(getTravellerBookingsKey(bookingData.traveller_id), FULL_TTL_SECONDS);
    }
    
    console.log(`[BookingStatusCache] Cached full booking ${bookingId}`);
    return true;
  } catch (error) {
    console.error("[BookingStatusCache] Error caching full booking:", error.message);
    return false;
  }
}

// ─── Get Cached Full Booking ──────────────────────────────────────────────────

export async function getCachedFullBooking(bookingId) {
  if (!isRedisAvailable()) return null;

  try {
    const key = getFullCacheKey(bookingId);
    const cached = await redis.get(key);
    
    if (cached) {
      console.log(`[BookingStatusCache] Cache HIT for full booking ${bookingId}`);
      return JSON.parse(cached);
    }

    console.log(`[BookingStatusCache] Cache MISS for full booking ${bookingId}`);
    return null;
  } catch (error) {
    console.error("[BookingStatusCache] Error getting cached full booking:", error.message);
    return null;
  }
}

// ─── Get Booking (with caching) ───────────────────────────────────────────────

export async function getBooking(bookingId) {
  try {
    const cached = await getCachedFullBooking(bookingId);
    if (cached) return cached;

    console.log(`[BookingStatusCache] Querying database for booking ${bookingId}`);
    
    const result = await sequelize.query(
      `SELECT * FROM bookings WHERE id = :bookingId`,
      { 
        replacements: { bookingId },
        type: sequelize.QueryTypes.SELECT 
      }
    );

    if (!result || result.length === 0) return null;

    const bookingData = result[0];
    await cacheFullBooking(bookingId, bookingData);

    return bookingData;
  } catch (error) {
    console.error("[BookingStatusCache] Error getting booking:", error.message);
    return null;
  }
}

// ─── Get User Bookings (with caching) ─────────────────────────────────────────

export async function getUserBookings(userId) {
  try {
    if (isRedisAvailable()) {
      const bookingIds = await redis.smembers(getUserBookingsKey(userId));
      
      if (bookingIds && bookingIds.length > 0) {
        console.log(`[BookingStatusCache] Cache HIT: ${bookingIds.length} bookings for user ${userId}`);
        
        const pipeline = redis.pipeline();
        bookingIds.forEach(id => pipeline.get(getFullCacheKey(id)));
        const results = await pipeline.exec();
        
        const bookings = results
          .filter(([err, data]) => !err && data)
          .map(([, data]) => JSON.parse(data));
        
        if (bookings.length === bookingIds.length) return bookings;
      }
    }

    console.log(`[BookingStatusCache] Querying database for user ${userId} bookings`);
    
    const bookings = await sequelize.query(
      `SELECT * FROM bookings WHERE user_id = :userId ORDER BY created_at DESC`,
      { 
        replacements: { userId },
        type: sequelize.QueryTypes.SELECT 
      }
    );

    if (isRedisAvailable() && bookings.length > 0) {
      const pipeline = redis.pipeline();
      
      bookings.forEach(booking => {
        pipeline.set(getFullCacheKey(booking.id), JSON.stringify(booking), "EX", FULL_TTL_SECONDS);
        pipeline.sadd(getUserBookingsKey(userId), booking.id);
      });
      
      pipeline.expire(getUserBookingsKey(userId), FULL_TTL_SECONDS);
      await pipeline.exec();
    }

    return bookings;
  } catch (error) {
    console.error("[BookingStatusCache] Error getting user bookings:", error.message);
    return [];
  }
}

// ─── Invalidate Booking Cache ─────────────────────────────────────────────────

export async function invalidateBookingCache(bookingId, userId = null, travellerId = null) {
  if (!isRedisAvailable()) return false;

  try {
    await redis.del(getStatusCacheKey(bookingId));
    await redis.del(getFullCacheKey(bookingId));
    
    if (userId) {
      await redis.srem(getUserBookingsKey(userId), bookingId);
    }
    
    if (travellerId) {
      await redis.srem(getTravellerBookingsKey(travellerId), bookingId);
    }
    
    console.log(`[BookingStatusCache] Invalidated cache for booking ${bookingId}`);
    return true;
  } catch (error) {
    console.error("[BookingStatusCache] Error invalidating cache:", error.message);
    return false;
  }
}

export default { 
  cacheBookingStatus, 
  getCachedBookingStatus, 
  cacheFullBooking,
  getCachedFullBooking,
  getBooking,
  getUserBookings,
  invalidateBookingCache
};
