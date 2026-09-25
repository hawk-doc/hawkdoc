import { env } from './env.js';
import { createApp } from './app.js';
import { hocuspocusServer, waitForDisconnectWrites } from './hocuspocus.js';
import { redis, startFlushScheduler, flushBufferedDocs } from './redis.js';
import query, { pool } from './db.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = createApp();

async function persistDocState(docId: string, update: Buffer): Promise<void> {
  await query(
    `UPDATE documents SET yjs_state = $1, updated_at = NOW() WHERE id = $2`,
    [update, docId],
  );
}

// Flush scheduler: buffer Redis → PostgreSQL every 30s
const flushScheduler = startFlushScheduler(persistDocState);

// Start REST API
const httpServer = app.listen(env.PORT, () => {
  console.log(`REST API listening on http://localhost:${env.PORT}`);
});

// Start Hocuspocus WebSocket server
void hocuspocusServer.listen();
console.log(`Hocuspocus WS server listening on ws://localhost:${env.HOCUSPOCUS_PORT}`);

// Graceful shutdown — without this, up to 30s of edits still sitting in the
// Redis buffer are never written to PostgreSQL when the process is stopped.
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received — shutting down`);

  const forceExit = setTimeout(() => {
    console.error(`Shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms — forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await flushScheduler.stop();
    // Closes every WebSocket; onDisconnect writes each open document's state
    await hocuspocusServer.destroy();
    await waitForDisconnectWrites();
    // Catch anything still buffered (e.g. documents whose flush failed earlier)
    await flushBufferedDocs(persistDocState);
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
      httpServer.closeIdleConnections();
    });
    await redis.quit();
    await pool.end();
    console.log('Shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', (signal) => { void shutdown(signal); });
process.on('SIGINT', (signal) => { void shutdown(signal); });
