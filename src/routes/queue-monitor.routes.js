import express from "express";
import { Queue } from "bullmq";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import redis from "../redis/redis.config.js";
import { asyncTaskQueue, ASYNC_TASK_QUEUE_NAME } from "../jobs/asyncTasks.queue.js";

const router = express.Router();

function getNotificationQueue() {
  if (!redis) return null;
  return new Queue("notification-queue", { connection: redis });
}

router.get("/health", authMiddleware, async (req, res) => {
  if (!redis) {
    return res.status(200).json({
      success: true,
      redis: false,
      queues: {},
      message: "Redis unavailable",
    });
  }

  try {
    const notificationQueue = getNotificationQueue();
    const queues = [asyncTaskQueue, notificationQueue].filter(Boolean);

    const summaries = {};
    for (const queue of queues) {
      const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
      summaries[queue.name] = counts;
    }

    await notificationQueue?.close();

    return res.status(200).json({
      success: true,
      redis: true,
      queue_default: ASYNC_TASK_QUEUE_NAME,
      queues: summaries,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to get queue health",
      error: error.message,
    });
  }
});

export default router;
