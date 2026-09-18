import Redis from 'ioredis';
import { env } from './env.js';

export const redis = new Redis(env.REDIS_URL);

const FLUSH_INTERVAL_MS = 30_000;
const BUFFER_KEY_PREFIX = 'doc:buffer:';

// The buffer holds each document's full Yjs state as seen by *this* process.
// That's only coherent with a single Hocuspocus instance; running several
// against one Redis needs @hocuspocus/extension-redis to sync them first.

/** Buffer key for a document's Yjs update in Redis */
export function docBufferKey(docId: string): string {
  return `${BUFFER_KEY_PREFIX}${docId}`;
}

// Compare-and-delete: only drops the buffer if it still holds the state we
// persisted. An update buffered while PostgreSQL was being written survives
// for the next flush instead of being deleted unsaved.
const DELETE_IF_UNCHANGED_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export async function deleteBufferIfUnchanged(docId: string, expected: Buffer): Promise<boolean> {
  const deleted = await redis.eval(DELETE_IF_UNCHANGED_SCRIPT, 1, docBufferKey(docId), expected);
  return deleted === 1;
}

export type FlushFn = (docId: string, update: Buffer) => Promise<void>;

/** Move every buffered document update from Redis to PostgreSQL */
export async function flushBufferedDocs(flushFn: FlushFn): Promise<void> {
  // SCAN instead of KEYS — KEYS blocks Redis while it walks the whole keyspace
  const stream = redis.scanStream({ match: `${BUFFER_KEY_PREFIX}*`, count: 100 });
  for await (const keys of stream as AsyncIterable<string[]>) {
    for (const key of keys) {
      const docId = key.slice(BUFFER_KEY_PREFIX.length);
      try {
        const data = await redis.getBuffer(key);
        if (!data) continue;
        await flushFn(docId, data);
        await deleteBufferIfUnchanged(docId, data);
      } catch (err) {
        // Keep going — one failing document must not block the others
        console.error(`Failed to flush buffered update for ${docId}:`, err);
      }
    }
  }
}

export interface FlushScheduler {
  /** Stop the interval and wait for an in-progress flush to finish */
  stop: () => Promise<void>;
}

/** Start the periodic flush: moves Redis buffered updates to PostgreSQL */
export function startFlushScheduler(flushFn: FlushFn): FlushScheduler {
  let inFlight: Promise<void> | null = null;

  const timer = setInterval(() => {
    // Skip a tick rather than overlap a flush that is still running
    if (inFlight) return;
    inFlight = flushBufferedDocs(flushFn)
      .catch((err: unknown) => { console.error('Flush scheduler error:', err); })
      .finally(() => { inFlight = null; });
  }, FLUSH_INTERVAL_MS);

  return {
    stop: async () => {
      clearInterval(timer);
      await inFlight;
    },
  };
}
