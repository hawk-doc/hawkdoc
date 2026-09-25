import express, { type Request, type Response, type NextFunction } from 'express';
import { env } from './env.js';
import { authRouter } from './routes/auth.js';
import { documentsRouter } from './routes/documents.js';
import { uploadsRouter, UPLOADS_DIR } from './routes/uploads.js';
import { hocuspocusServer, waitForDisconnectWrites } from './hocuspocus.js';
import { redis, startFlushScheduler, flushBufferedDocs } from './redis.js';
import query, { pool } from './db.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = express();

// CORS — must be the very first middleware so every response (including
// errors from body-parser, multer, auth) carries the correct headers.
const ALLOWED_ORIGINS = new Set(env.ALLOWED_ORIGINS);

function setCors(req: Request, res: Response): void {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

app.use((req, res, next) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Body parsing — after CORS so parse errors still get CORS headers
app.use(express.json({ limit: `${env.MAX_FILE_SIZE_MB}mb` }));

// Static file serving for uploaded images. nosniff stops a browser treating an
// upload as anything other than its declared image type, and the sandbox CSP
// keeps scripts from running if a file is opened directly (covers any SVGs
// uploaded before the type allowlist existed).
app.use('/uploads', express.static(UPLOADS_DIR, {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  },
}));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/uploads', uploadsRouter);

// Checks its dependencies: a process that can't reach PostgreSQL or Redis
// can't serve documents, and a health check that ignores them tells a load
// balancer to keep sending traffic to it.
app.get('/healthz', (_req, res) => {
  void (async () => {
    const [postgres, redisStatus] = await Promise.all([
      query('SELECT 1').then(() => 'ok' as const, () => 'down' as const),
      redis.ping().then(() => 'ok' as const, () => 'down' as const),
    ]);
    const healthy = postgres === 'ok' && redisStatus === 'ok';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      postgres,
      redis: redisStatus,
      ts: new Date().toISOString(),
    });
  })();
});

async function persistDocState(docId: string, update: Buffer): Promise<void> {
  await query(
    `UPDATE documents SET yjs_state = $1, updated_at = NOW() WHERE id = $2`,
    [update, docId],
  );
}

// Flush scheduler: buffer Redis → PostgreSQL every 30s
const flushScheduler = startFlushScheduler(persistDocState);

// Global error handler — CORS headers must also be set here because Express
// error handlers bypass all previous middleware when called via next(err).
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  setCors(req, res);
  console.error(err);
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  res.status(500).json({ error: message });
});

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
