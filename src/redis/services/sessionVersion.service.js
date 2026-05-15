import redis from "../redis.config.js";

function sessionKey(userId) {
  return `session:version:${userId}`;
}

export async function getSessionVersion(userId) {
  if (!redis) return 1;
  const value = await redis.get(sessionKey(userId));
  if (!value) {
    await redis.set(sessionKey(userId), "1");
    return 1;
  }
  return parseInt(value, 10) || 1;
}

export async function bumpSessionVersion(userId) {
  if (!redis) return 1;
  return redis.incr(sessionKey(userId));
}
