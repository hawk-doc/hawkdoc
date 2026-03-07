import Redis from 'ioredis';
import { env } from './env.js';

export const redis = new Redis(env.REDIS_URL);

const FLUSH_INTERVAL_MS = 30_000;

/** Buffer key for a document's Yjs update in Redis */
export function docBufferKey(docId: string): string {
  return `doc:buffer:${docId}`;
}

/** Start the periodic flush: moves Redis buffered updates to PostgreSQL */
export function startFlushScheduler(
  flushFn: (docId: string, update: Buffer) => Promise<void>,
): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const keys = await redis.keys('doc:buffer:*');
      for (const key of keys) {
        const docId = key.replace('doc:buffer:', '');
        const data = await redis.getBuffer(key);
        if (data) {
          await flushFn(docId, data);
          await redis.del(key);
        }
      }
    } catch (err) {
      console.error('Flush scheduler error:', err);
    }
  }, FLUSH_INTERVAL_MS);
}
