/**
 * Redis Module - Central Export
 * 
 * All Redis-related functionality organized in one place:
 * - Configuration
 * - Cache Services
 * - Redis Services (OTP, Token Blacklist, etc.)
 * - Utilities
 */

// ─── Configuration ────────────────────────────────────────────────────────────
export { default as redis } from './redis.config.js';

// ─── Cache Services ───────────────────────────────────────────────────────────
export * from './cache/authUserCache.service.js';
export * from './cache/userProfileCache.service.js';
export * from './cache/travellerRouteCache.service.js';
export * from './cache/parcelRequestCache.service.js';
export * from './cache/bookingStatusCache.service.js';
export * from './cache/kycStatusCache.service.js';
export * from './cache/notificationCountCache.service.js';
export * from './cache/deviceTokenCache.service.js';
export * from './cache/platformSettingsCache.service.js';
export * from './cache/detourCache.service.js';
export * from './cache/googleApiCache.service.js';

// ─── Matching Engine Cache Services (CRITICAL for performance) ───────────────
export * from './cache/spatialQueryCache.service.js';
export * from './cache/activeRoutesCache.service.js';
export * from './cache/routeGeometryCache.service.js';

// ─── Redis Services ───────────────────────────────────────────────────────────
export * from './services/otp.service.js';
export * from './services/tokenBlacklist.service.js';
export * from './services/sessionVersion.service.js';
export * from './services/redisRealtime.service.js';

// ─── Utilities ────────────────────────────────────────────────────────────────
export * from './utils/redisLock.util.js';
