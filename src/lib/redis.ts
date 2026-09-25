import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

/** Koneksi Redis untuk kebutuhan baca dari API routes (presence, dll). */
export function getRedisClient(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
  }
  return globalForRedis.redis;
}
