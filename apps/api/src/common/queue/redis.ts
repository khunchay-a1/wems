import { Redis, type RedisOptions } from 'ioredis';

/** BullMQ needs maxRetriesPerRequest: null on blocking connections. */
export function createRedis(url: string, opts: RedisOptions = {}): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    ...opts,
  });
}
