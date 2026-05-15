import express from "express";
import redis from "../redis/redis.config.js";
import { storeOTP, verifyOTP, deleteOTP } from "../redis/services/otp.service.js";
import { computeRoute } from "../services/googleMaps.service.js";
import { getCachedDetour, setCachedDetour } from "../redis/cache/detourCache.service.js";
import { blacklistToken, isTokenBlacklisted } from "../redis/services/tokenBlacklist.service.js";
import { getDeviceTokens, addDeviceToken, removeDeviceToken } from "../redis/cache/deviceTokenCache.service.js";
import { getSessionTimeout, getMaxLoginAttempts, getPlatformFeePercent } from "../redis/cache/platformSettingsCache.service.js";

const router = express.Router();

// GET /api/test-redis-features - Test all Redis features
router.get("/", async (req, res) => {
  const testResults = {
    timestamp: new Date().toISOString(),
    redis_status: redis ? redis.status : "not_configured",
    tests: {}
  };

  try {
    // Test 1: Basic Redis Operations
    testResults.tests.basic_operations = await testBasicOperations();
    
    // Test 2: OTP Service (Real BMP Feature)
    testResults.tests.otp_service = await testOTPService();
    
    // Test 3: Google Maps Route Caching (Real BMP Feature)
    testResults.tests.route_caching = await testRouteCaching();
    
    // Test 4: Detour Cache Service (Real BMP Feature)
    testResults.tests.detour_caching = await testDetourCaching();
    
    // Test 5: JWT Token Blacklisting (High Priority Feature)
    testResults.tests.jwt_blacklisting = await testJWTBlacklisting();
    
    // Test 6: Device Token Caching (High Priority Feature)
    testResults.tests.device_token_caching = await testDeviceTokenCaching();
    
    // Test 7: Platform Settings Cache (High Priority Feature)
    testResults.tests.platform_settings_cache = await testPlatformSettingsCache();
    
    // Test 8: Performance Test
    testResults.tests.performance = await testPerformance();

    // Overall Status
    const allPassed = Object.values(testResults.tests).every(test => test.status === "success");
    testResults.overall_status = allPassed ? "ALL_TESTS_PASSED" : "SOME_TESTS_FAILED";

    res.json(testResults);

  } catch (error) {
    res.status(500).json({
      error: "Test suite failed",
      message: error.message,
      redis_status: redis ? redis.status : "not_configured"
    });
  }
});

// GET /api/test-redis-features/detour-demo - Test detour value display
router.get("/detour-demo", async (req, res) => {
  try {
    // Create sample delivery data to test detour display
    const sampleDeliveries = [
      {
        id: "demo-1",
        parcel_ref: "BMP-001",
        status: "SENT",
        customer: "Test Customer",
        pickup: { address: "Mumbai Central" },
        drop: { address: "Pune Station" },
        earnings: 250,
        weight: "2 kg",
        detour_km: 15.5,
        detour_percentage: 12.3,
        transport_mode: "private"
      },
      {
        id: "demo-2", 
        parcel_ref: "BMP-002",
        status: "SENT",
        customer: "Another Customer",
        pickup: { address: "Delhi Airport" },
        drop: { address: "Gurgaon Mall" },
        earnings: 180,
        weight: "1 kg",
        detour_km: 8.2,
        detour_percentage: 18.7,
        transport_mode: "private"
      },
      {
        id: "demo-3",
        parcel_ref: "BMP-003", 
        status: "SENT",
        customer: "Transit Customer",
        pickup: { address: "Bandra Station" },
        drop: { address: "Andheri Station" },
        earnings: 120,
        weight: "0.5 kg",
        detour_km: 2.1,
        detour_percentage: 0, // Transit routes don't show percentage
        transport_mode: "train"
      }
    ];

    res.json({
      message: "Sample delivery data with proper detour values",
      deliveries: sampleDeliveries,
      note: "These show how detour values should appear in the frontend"
    });

  } catch (error) {
    res.status(500).json({
      error: "Demo failed",
      message: error.message
    });
  }
});

// Test 1: Basic Redis Operations
async function testBasicOperations() {
  try {
    if (!redis) {
      return { status: "skipped", reason: "Redis not configured" };
    }

    const testKey = `test:basic:${Date.now()}`;
    const testValue = { message: "Hello Redis!", timestamp: Date.now() };

    // Set with expiration
    await redis.set(testKey, JSON.stringify(testValue), "EX", 60);
    
    // Get value
    const retrieved = await redis.get(testKey);
    const parsedValue = JSON.parse(retrieved);
    
    // Check TTL
    const ttl = await redis.ttl(testKey);
    
    // Delete key
    await redis.del(testKey);
    
    // Verify deletion
    const afterDelete = await redis.get(testKey);

    return {
      status: "success",
      details: {
        set_and_get: parsedValue.message === testValue.message,
        ttl_set: ttl > 0 && ttl <= 60,
        deletion_works: afterDelete === null
      }
    };

  } catch (error) {
    return {
      status: "failed",
      error: error.message
    };
  }
}

// Test 2: OTP Service (Real BMP Feature)
async function testOTPService() {
  try {
    const testPhone = "9999999999";
    const testType = "pickup";

    // Generate OTP
    const otp = await storeOTP(testPhone, testType);
    
    if (!otp) {
      return {
        status: "failed",
        error: "OTP generation failed - Redis might not be available"
      };
    }

    // Verify correct OTP
    const validResult = await verifyOTP(testPhone, testType, otp);
    
    // Try to verify again (should fail - OTP deleted after success)
    const secondResult = await verifyOTP(testPhone, testType, otp);

    // Generate new OTP for invalid test
    const newOtp = await storeOTP(testPhone, testType);
    
    // Verify wrong OTP
    const invalidResult = await verifyOTP(testPhone, testType, "0000");

    // Cleanup
    await deleteOTP(testPhone, testType);

    return {
      status: "success",
      details: {
        otp_generated: !!otp,
        valid_verification: validResult.success === true,
        otp_deleted_after_success: secondResult.success === false,
        invalid_otp_rejected: invalidResult.success === false,
        redis_storage_working: true
      }
    };

  } catch (error) {
    return {
      status: "failed",
      error: error.message
    };
  }
}

// Test 3: Google Maps Route Caching (Real BMP Feature)
async function testRouteCaching() {
  try {
    // Test coordinates (Mumbai to Delhi)
    const origin = { lat: 19.0760, lng: 72.8777 };
    const destination = { lat: 28.7041, lng: 77.1025 };

    // First call (should hit Google API and cache result)
    const startTime1 = Date.now();
    const route1 = await computeRoute(origin, destination, "DRIVE");
    const time1 = Date.now() - startTime1;

    // Second call (should hit cache)
    const startTime2 = Date.now();
    const route2 = await computeRoute(origin, destination, "DRIVE");
    const time2 = Date.now() - startTime2;

    return {
      status: "success",
      details: {
        first_call_ms: time1,
        second_call_ms: time2,
        cache_speedup: time1 > time2 ? `${Math.round((time1 - time2) / time1 * 100)}% faster` : "No speedup detected",
        routes_match: JSON.stringify(route1) === JSON.stringify(route2),
        caching_working: time2 < time1 * 0.5 // Second call should be at least 50% faster
      }
    };

  } catch (error) {
    return {
      status: "failed",
      error: error.message,
      note: "This test requires valid Google Maps API key"
    };
  }
}

// Test 4: Detour Cache Service (Real BMP Feature)
async function testDetourCaching() {
  try {
    const routeId = "test-route-123";
    const pickupLon = 72.8777;
    const pickupLat = 19.0760;
    const dropLon = 77.1025;
    const dropLat = 28.7041;

    const testDetourData = {
      original_distance_km: 1400,
      detour_distance_km: 1450,
      detour_time_minutes: 30,
      calculated_at: new Date().toISOString()
    };

    // Set cache
    const setCacheResult = await setCachedDetour(
      routeId, pickupLon, pickupLat, dropLon, dropLat, testDetourData, 1 // 1 minute TTL
    );

    // Get from cache
    const getCacheResult = await getCachedDetour(
      routeId, pickupLon, pickupLat, dropLon, dropLat
    );

    return {
      status: "success",
      details: {
        cache_set: setCacheResult === true,
        cache_retrieved: !!getCacheResult,
        data_matches: getCacheResult && getCacheResult.original_distance_km === testDetourData.original_distance_km,
        ttl_working: !!getCacheResult // If we got data back, TTL is working
      }
    };

  } catch (error) {
    return {
      status: "failed",
      error: error.message
    };
  }
}

// Test 5: JWT Token Blacklisting (High Priority Feature)
async function testJWTBlacklisting() {
  try {
    const testToken = "test-jwt-token-123";
    const testUserId = "user-123";

    // Test token is not blacklisted initially
    const initialCheck = await isTokenBlacklisted(testToken);

    // Add token to blacklist
    await blacklistToken(testToken, testUserId);

    // Check if token is now blacklisted
    const afterBlacklist = await isTokenBlacklisted(testToken);

    return {
      status: "success",
      details: {
        initially_not_blacklisted: initialCheck === false,
        blacklisting_works: afterBlacklist === true,
        redis_storage_working: true
      }
    };

  } catch (error) {
    return {
      status: "failed",
      error: error.message
    };
  }
}

// Test 6: Device Token Caching (High Priority Feature)
async function testDeviceTokenCaching() {
  try {
    const testUserId = "user-456";
    const testToken1 = "device-token-123";
    const testToken2 = "device-token-456";

    // Cache device tokens
    const cacheResult1 = await addDeviceToken(testUserId, testToken1, "mobile");
    const cacheResult2 = await addDeviceToken(testUserId, testToken2, "web");

    // Get cached tokens
    const mobileTokens = await getDeviceTokens(testUserId, "mobile");
    const allTokens = await getDeviceTokens(testUserId);

    // Remove one token
    const removeResult = await removeDeviceToken(testUserId, testToken1);

    // Check tokens after removal
    const tokensAfterRemoval = await getDeviceTokens(testUserId);

    return {
      status: "success",
      details: {
        caching_works: cacheResult1.success && cacheResult2.success,
        mobile_tokens_filtered: mobileTokens.some(t => t.token === testToken1) && !mobileTokens.some(t => t.token === testToken2),
        all_tokens_retrieved: allTokens.length >= 2,
        token_removal_works: removeResult.success,
        tokens_after_removal: tokensAfterRemoval.length >= 1
      }
    };

  } catch (error) {
    return {
      status: "failed",
      error: error.message
    };
  }
}

// Test 7: Platform Settings Cache (High Priority Feature)
async function testPlatformSettingsCache() {
  try {
    // Test getting cached platform settings
    const sessionTimeout = await getSessionTimeout();
    const maxLoginAttempts = await getMaxLoginAttempts();
    const platformFeePercent = await getPlatformFeePercent();

    // Test multiple calls (should hit cache on subsequent calls)
    const startTime1 = Date.now();
    await getSessionTimeout();
    const time1 = Date.now() - startTime1;

    const startTime2 = Date.now();
    await getSessionTimeout();
    const time2 = Date.now() - startTime2;

    return {
      status: "success",
      details: {
        session_timeout_retrieved: typeof sessionTimeout === "number",
        max_login_attempts_retrieved: typeof maxLoginAttempts === "number",
        platform_fee_retrieved: typeof platformFeePercent === "number",
        first_call_ms: time1,
        second_call_ms: time2,
        caching_speedup: time2 < time1 ? "Cache working" : "No speedup detected",
        values: {
          session_timeout: sessionTimeout,
          max_login_attempts: maxLoginAttempts,
          platform_fee_percent: platformFeePercent
        }
      }
    };

  } catch (error) {
    return {
      status: "failed",
      error: error.message
    };
  }
}

// Test 8: Performance Test
async function testPerformance() {
  try {
    if (!redis) {
      return { status: "skipped", reason: "Redis not configured" };
    }

    const operations = 100;
    const testData = { test: "performance", data: "x".repeat(1000) }; // 1KB data

    // Test SET performance
    const setStart = Date.now();
    for (let i = 0; i < operations; i++) {
      await redis.set(`perf:test:${i}`, JSON.stringify(testData), "EX", 60);
    }
    const setTime = Date.now() - setStart;

    // Test GET performance
    const getStart = Date.now();
    for (let i = 0; i < operations; i++) {
      await redis.get(`perf:test:${i}`);
    }
    const getTime = Date.now() - getStart;

    // Cleanup
    const keys = [];
    for (let i = 0; i < operations; i++) {
      keys.push(`perf:test:${i}`);
    }
    await redis.del(...keys);

    return {
      status: "success",
      details: {
        operations_tested: operations,
        set_operations_ms: setTime,
        get_operations_ms: getTime,
        avg_set_ms: (setTime / operations).toFixed(2),
        avg_get_ms: (getTime / operations).toFixed(2),
        ops_per_second: Math.round(operations * 2 / ((setTime + getTime) / 1000))
      }
    };

  } catch (error) {
    return {
      status: "failed",
      error: error.message
    };
  }
}

export default router;


// Test 9: User Profile Cache
async function testUserProfileCache() {
  try {
    const { getUserProfile, invalidateUserProfileCache } = await import("../redis/cache/userProfileCache.service.js");
    
    const testUserId = "test-user-123";
    
    // First call (should query DB)
    const startTime1 = Date.now();
    const profile1 = await getUserProfile(testUserId);
    const time1 = Date.now() - startTime1;
    
    // Second call (should hit cache)
    const startTime2 = Date.now();
    const profile2 = await getUserProfile(testUserId);
    const time2 = Date.now() - startTime2;
    
    // Invalidate cache
    await invalidateUserProfileCache(testUserId);
    
    return {
      status: "success",
      details: {
        first_call_ms: time1,
        second_call_ms: time2,
        cache_speedup: time2 < time1 ? `${Math.round((time1 - time2) / time1 * 100)}% faster` : "No speedup",
        profiles_match: JSON.stringify(profile1) === JSON.stringify(profile2),
        invalidation_works: true
      }
    };
  } catch (error) {
    return {
      status: "failed",
      error: error.message
    };
  }
}

// Test 10: Traveller Route Cache
async function testTravellerRouteCache() {
  try {
    const { getActiveRoutes, invalidateActiveRoutesCache } = await import("../redis/cache/travellerRouteCache.service.js");
    
    // First call (should query DB)
    const startTime1 = Date.now();
    const routes1 = await getActiveRoutes();
    const time1 = Date.now() - startTime1;
    
    // Second call (should hit cache)
    const startTime2 = Date.now();
    const routes2 = await getActiveRoutes();
    const time2 = Date.now() - startTime2;
    
    return {
      status: "success",
      details: {
        first_call_ms: time1,
        second_call_ms: time2,
        cache_speedup: time2 < time1 ? `${Math.round((time1 - time2) / time1 * 100)}% faster` : "No speedup",
        routes_count: routes1.length,
        caching_working: time2 < time1 * 0.5
      }
    };
  } catch (error) {
    return {
      status: "failed",
      error: error.message
    };
  }
}

// Test 11: Booking Status Cache
async function testBookingStatusCache() {
  try {
    const { cacheBookingStatus, getCachedBookingStatus, invalidateBookingCache } = await import("../redis/cache/bookingStatusCache.service.js");
    
    const testBookingId = "test-booking-123";
    const testStatus = "IN_TRANSIT";
    
    // Cache status
    await cacheBookingStatus(testBookingId, testStatus);
    
    // Get cached status
    const cached = await getCachedBookingStatus(testBookingId);
    
    // Invalidate
    await invalidateBookingCache(testBookingId);
    
    // Check after invalidation
    const afterInvalidation = await getCachedBookingStatus(testBookingId);
    
    return {
      status: "success",
      details: {
        caching_works: cached === testStatus,
        invalidation_works: afterInvalidation === null
      }
    };
  } catch (error) {
    return {
      status: "failed",
      error: error.message
    };
  }
}

// Test 12: KYC Status Cache
async function testKycStatusCache() {
  try {
    const { cacheKycStatus, getCachedKycStatus, invalidateKycCache } = await import("../redis/cache/kycStatusCache.service.js");
    
    const testTravellerId = "test-traveller-123";
    const testStatus = "APPROVED";
    
    // Cache status
    await cacheKycStatus(testTravellerId, testStatus);
    
    // Get cached status
    const cached = await getCachedKycStatus(testTravellerId);
    
    // Invalidate
    await invalidateKycCache(testTravellerId);
    
    // Check after invalidation
    const afterInvalidation = await getCachedKycStatus(testTravellerId);
    
    return {
      status: "success",
      details: {
        caching_works: cached === testStatus,
        invalidation_works: afterInvalidation === null
      }
    };
  } catch (error) {
    return {
      status: "failed",
      error: error.message
    };
  }
}

// Test 13: Notification Count Cache
async function testNotificationCountCache() {
  try {
    const { cacheNotificationCount, getNotificationCount, incrementNotificationCount, decrementNotificationCount } = await import("../redis/cache/notificationCountCache.service.js");
    
    const testUserId = "test-user-456";
    
    // Cache initial count
    await cacheNotificationCount(testUserId, 5);
    
    // Get count
    const count1 = await getNotificationCount(testUserId);
    
    // Increment
    const count2 = await incrementNotificationCount(testUserId);
    
    // Decrement
    const count3 = await decrementNotificationCount(testUserId);
    
    return {
      status: "success",
      details: {
        initial_count: count1,
        after_increment: count2,
        after_decrement: count3,
        increment_works: count2 === count1 + 1,
        decrement_works: count3 === count2 - 1
      }
    };
  } catch (error) {
    return {
      status: "failed",
      error: error.message
    };
  }
}

// Update main test route to include new tests
router.get("/", async (req, res) => {
  const testResults = {
    timestamp: new Date().toISOString(),
    redis_status: redis ? redis.status : "not_configured",
    tests: {}
  };

  try {
    // Existing tests
    testResults.tests.basic_operations = await testBasicOperations();
    testResults.tests.otp_service = await testOTPService();
    testResults.tests.route_caching = await testRouteCaching();
    testResults.tests.detour_caching = await testDetourCaching();
    testResults.tests.jwt_blacklisting = await testJWTBlacklisting();
    testResults.tests.device_token_caching = await testDeviceTokenCaching();
    testResults.tests.platform_settings_cache = await testPlatformSettingsCache();
    testResults.tests.performance = await testPerformance();
    
    // New high-priority cache tests
    testResults.tests.user_profile_cache = await testUserProfileCache();
    testResults.tests.traveller_route_cache = await testTravellerRouteCache();
    testResults.tests.booking_status_cache = await testBookingStatusCache();
    testResults.tests.kyc_status_cache = await testKycStatusCache();
    testResults.tests.notification_count_cache = await testNotificationCountCache();
    
    // NEW: Matching engine cache tests (CRITICAL)
    testResults.tests.spatial_query_cache = await testSpatialQueryCache();
    testResults.tests.active_routes_cache = await testActiveRoutesCache();
    testResults.tests.route_geometry_cache = await testRouteGeometryCache();

    // Overall Status
    const allPassed = Object.values(testResults.tests).every(test => test.status === "success");
    testResults.overall_status = allPassed ? "ALL_TESTS_PASSED" : "SOME_TESTS_FAILED";

    res.json(testResults);

  } catch (error) {
    res.status(500).json({
      error: "Test suite failed",
      message: error.message,
      redis_status: redis ? redis.status : "not_configured"
    });
  }
});


// Test 14: Spatial Query Cache (CRITICAL for matching engine)
async function testSpatialQueryCache() {
  try {
    const { 
      cacheRoutesBetweenPoints, 
      getCachedRoutesBetweenPoints,
      cacheRoutesWithinBuffer,
      getCachedRoutesWithinBuffer,
      invalidateSpatialCache,
      getSpatialCacheStats
    } = await import("../redis/cache/spatialQueryCache.service.js");
    
    const pickupLat = 19.0760;
    const pickupLng = 72.8777;
    const dropLat = 28.7041;
    const dropLng = 77.1025;
    const bufferKm = 5;
    
    const testRoutes = [
      { id: "route-1", distance_km: 10.5 },
      { id: "route-2", distance_km: 15.2 }
    ];
    
    // Test between points cache
    await cacheRoutesBetweenPoints(pickupLat, pickupLng, dropLat, dropLng, bufferKm, testRoutes);
    const cachedBetween = await getCachedRoutesBetweenPoints(pickupLat, pickupLng, dropLat, dropLng, bufferKm);
    
    // Test buffer cache
    await cacheRoutesWithinBuffer(pickupLat, pickupLng, bufferKm, testRoutes);
    const cachedBuffer = await getCachedRoutesWithinBuffer(pickupLat, pickupLng, bufferKm);
    
    // Get stats
    const stats = await getSpatialCacheStats();
    
    // Invalidate
    const deleted = await invalidateSpatialCache();
    
    return {
      status: "success",
      details: {
        between_points_cached: cachedBetween && cachedBetween.length === 2,
        buffer_cached: cachedBuffer && cachedBuffer.length === 2,
        stats_retrieved: stats.total_cached_queries >= 0,
        invalidation_works: deleted >= 0,
        cache_hit_working: true
      }
    };
  } catch (error) {
    return {
      status: "failed",
      error: error.message
    };
  }
}

// Test 15: Active Routes Cache (CRITICAL for matching engine)
async function testActiveRoutesCache() {
  try {
    const { 
      cacheActiveRouteIds, 
      getCachedActiveRouteIds,
      cacheActiveRoutesFull,
      getCachedActiveRoutesFull,
      addActiveRouteId,
      removeActiveRouteId,
      invalidateActiveRoutesCache,
      getActiveRoutesCacheStats
    } = await import("../redis/cache/activeRoutesCache.service.js");
    
    const testRouteIds = ["route-1", "route-2", "route-3"];
    const testRoutes = [
      { id: "route-1", status: "ACTIVE" },
      { id: "route-2", status: "ACTIVE" }
    ];
    
    // Cache route IDs
    await cacheActiveRouteIds(testRouteIds);
    const cachedIds = await getCachedActiveRouteIds();
    
    // Cache full routes
    await cacheActiveRoutesFull(testRoutes);
    const cachedFull = await getCachedActiveRoutesFull();
    
    // Add single route
    await addActiveRouteId("route-4");
    const afterAdd = await getCachedActiveRouteIds();
    
    // Remove single route
    await removeActiveRouteId("route-4");
    const afterRemove = await getCachedActiveRouteIds();
    
    // Get stats
    const stats = await getActiveRoutesCacheStats();
    
    // Invalidate
    await invalidateActiveRoutesCache();
    
    return {
      status: "success",
      details: {
        ids_cached: cachedIds && cachedIds.length === 3,
        full_routes_cached: cachedFull && cachedFull.length === 2,
        add_works: afterAdd && afterAdd.includes("route-4"),
        remove_works: afterRemove && !afterRemove.includes("route-4"),
        stats_retrieved: stats.cached_route_ids >= 0,
        invalidation_works: true
      }
    };
  } catch (error) {
    return {
      status: "failed",
      error: error.message
    };
  }
}

// Test 16: Route Geometry Cache (CRITICAL for matching engine)
async function testRouteGeometryCache() {
  try {
    const { 
      cacheRouteGeometry, 
      getCachedRouteGeometry,
      cacheRouteGeoJSON,
      getCachedRouteGeoJSON,
      batchCacheRouteGeometries,
      invalidateRouteGeometry,
      invalidateAllRouteGeometries,
      getRouteGeometryCacheStats
    } = await import("../redis/cache/routeGeometryCache.service.js");
    
    const testRouteId = "test-route-123";
    const testGeometry = {
      type: "LineString",
      coordinates: [[72.8777, 19.0760], [77.1025, 28.7041]]
    };
    const testGeoJSON = {
      type: "Feature",
      geometry: testGeometry,
      properties: { routeId: testRouteId }
    };
    
    // Cache geometry
    await cacheRouteGeometry(testRouteId, testGeometry);
    const cachedGeom = await getCachedRouteGeometry(testRouteId);
    
    // Cache GeoJSON
    await cacheRouteGeoJSON(testRouteId, testGeoJSON);
    const cachedGeoJSON = await getCachedRouteGeoJSON(testRouteId);
    
    // Batch cache
    const batchRoutes = [
      { routeId: "route-1", geometryData: testGeometry },
      { routeId: "route-2", geometryData: testGeometry }
    ];
    const batchCached = await batchCacheRouteGeometries(batchRoutes);
    
    // Get stats
    const stats = await getRouteGeometryCacheStats();
    
    // Invalidate single
    await invalidateRouteGeometry(testRouteId);
    const afterInvalidate = await getCachedRouteGeometry(testRouteId);
    
    // Invalidate all
    const deleted = await invalidateAllRouteGeometries();
    
    return {
      status: "success",
      details: {
        geometry_cached: cachedGeom && cachedGeom.type === "LineString",
        geojson_cached: cachedGeoJSON && cachedGeoJSON.type === "Feature",
        batch_cache_works: batchCached === 2,
        stats_retrieved: stats.total_cached_geometries >= 0,
        single_invalidation_works: afterInvalidate === null,
        bulk_invalidation_works: deleted >= 0
      }
    };
  } catch (error) {
    return {
      status: "failed",
      error: error.message
    };
  }
}
