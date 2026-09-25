import type Redis from "ioredis";

const PRESENCE_KEY_PREFIX = "presence:online:";

/**
 * Status online dihitung dari JUMLAH koneksi socket aktif per pengguna,
 * disimpan di Redis (bukan variabel in-memory proses) — ini yang membuatnya
 * akurat lintas instance server dan lintas multi-tab/multi-perangkat.
 * INCR/DECR di Redis atomik, jadi aman dari race condition connect/disconnect
 * yang nyaris bersamaan.
 */
export async function incrementPresence(redis: Redis, userId: string): Promise<number> {
  return redis.incr(`${PRESENCE_KEY_PREFIX}${userId}`);
}

export async function decrementPresence(redis: Redis, userId: string): Promise<number> {
  const count = await redis.decr(`${PRESENCE_KEY_PREFIX}${userId}`);
  if (count <= 0) {
    await redis.del(`${PRESENCE_KEY_PREFIX}${userId}`);
    return 0;
  }
  return count;
}

export async function isOnline(redis: Redis, userId: string): Promise<boolean> {
  const value = await redis.get(`${PRESENCE_KEY_PREFIX}${userId}`);
  return Boolean(value) && Number(value) > 0;
}

export async function getOnlineUserIds(redis: Redis, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const values = await redis.mget(userIds.map((id) => `${PRESENCE_KEY_PREFIX}${id}`));
  return userIds.filter((_, index) => values[index] && Number(values[index]) > 0);
}
