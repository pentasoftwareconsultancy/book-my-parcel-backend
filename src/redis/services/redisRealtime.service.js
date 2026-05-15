import redis from "../redis.config.js";
import { createBullMQConnection } from "../bullmq.connection.js";

const REALTIME_CHANNEL = "realtime:events";

export async function publishRealtimeEvent(eventName, payload) {
  if (!redis) return false;
  try {
    await redis.publish(
      REALTIME_CHANNEL,
      JSON.stringify({ eventName, payload })
    );
    return true;
  } catch (error) {
    console.warn("[RedisRealtime] Publish failed:", error.message);
    return false;
  }
}

export async function setupRealtimeSubscriber(io) {
  if (!redis || !io) return null;

  try {
    // Fresh isolated connection — subscriber must not share the main redis instance
    const subscriber = createBullMQConnection();
    if (!subscriber) return null;
    await subscriber.connect();
    await subscriber.subscribe(REALTIME_CHANNEL, (message) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed?.eventName === "notification:new" && parsed?.payload?.user_id) {
          io.to(`user_${parsed.payload.user_id}`).emit("new_notification", parsed.payload.notification);
        }
      } catch (error) {
        console.warn("[RedisRealtime] Message parse failed:", error.message);
      }
    });
    return subscriber;
  } catch (error) {
    console.warn("[RedisRealtime] Subscriber setup failed:", error.message);
    return null;
  }
}
