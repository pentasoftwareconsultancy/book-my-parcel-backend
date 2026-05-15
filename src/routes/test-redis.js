import express from "express";
import redis from "../redis/redis.config.js";

const router = express.Router();

/**
 * Test Redis Connection
 * GET /api/test-redis
 */
router.get("/", async (req, res) => {
  try {
    if (!redis) {
      return res.json({
        status: "error",
        message: "Redis not configured",
        redis_available: false
      });
    }

    // Test basic Redis operations
    const testKey = `test:${Date.now()}`;
    const testValue = "Hello from BMP Redis!";

    // Set a test value
    await redis.set(testKey, testValue, "EX", 60); // Expires in 60 seconds

    // Get the test value
    const retrievedValue = await redis.get(testKey);

    // Test Redis info
    const info = await redis.info("server");
    const redisVersion = info.match(/redis_version:([^\r\n]+)/)?.[1] || "unknown";

    // Clean up test key
    await redis.del(testKey);

    res.json({
      status: "success",
      message: "Redis is working perfectly!",
      redis_available: true,
      test_result: {
        set_value: testValue,
        retrieved_value: retrievedValue,
        values_match: testValue === retrievedValue
      },
      redis_info: {
        version: redisVersion,
        connection_status: redis.status
      },
      features_enabled: {
        otp_storage: true,
        route_caching: true,
        detour_caching: true,
        notification_queue: true
      }
    });

  } catch (error) {
    console.error("Redis test error:", error);
    res.status(500).json({
      status: "error",
      message: "Redis test failed",
      error: error.message,
      redis_available: false
    });
  }
});

export default router;