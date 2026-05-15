import redis from "../redis/redis.config.js";

export async function getKeysByPattern(pattern, count = 200) {
  if (!redis) return [];

  let cursor = "0";
  const keys = [];

  do {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", count);
    cursor = nextCursor;
    if (batch?.length) keys.push(...batch);
  } while (cursor !== "0");

  return keys;
}

export async function deleteByPattern(pattern) {
  if (!redis) return 0;
  const keys = await getKeysByPattern(pattern);
  if (!keys.length) return 0;
  return redis.del(...keys);
}
