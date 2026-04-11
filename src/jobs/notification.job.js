import { Worker } from "bullmq";
import redis from "../config/redis.config.js";
import Notification from "../modules/notification/notification.model.js";

const notificationWorker = new Worker(
  "notification-queue",
  async (job) => {
    const { user_id, role, type_code, title, message, meta } = job.data;

    // 1. Save to DB
    const notification = await Notification.create({
      user_id,
      role,
      type_code,
      title,
      message,
      meta,
    });

    // 2. Emit via socket
    const io = global.io;
    if (io) {
      io.to(`user_${user_id}`).emit("new_notification", {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        is_read: false,
      });
    }

    return notification;
  },
  {
    connection: redis,
    concurrency: 5, // 🔥 process 5 jobs at once
  }
);

// Logs
notificationWorker.on("completed", (job) => {
  console.log(`✅ Notification Job Done: ${job.id}`);
});

notificationWorker.on("failed", (job, err) => {
  console.error(`❌ Notification Job Failed: ${job?.id}`, err);
});

export default notificationWorker;