import express, { type Request, type Response, type NextFunction } from 'express';
import { env } from './env.js';
import { authRouter } from './routes/auth.js';
import { documentsRouter } from './routes/documents.js';
import { uploadsRouter, UPLOADS_DIR } from './routes/uploads.js';
import { hocuspocusServer } from './hocuspocus.js';
import { startFlushScheduler } from './redis.js';
import { query } from './db.js';

const app = express();

// CORS — must be the very first middleware so every response (including
// errors from body-parser, multer, auth) carries the correct headers.
function setCors(res: Response): void {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

app.use((req, res, next) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Body parsing — after CORS so parse errors still get CORS headers
app.use(express.json({ limit: `${env.MAX_FILE_SIZE_MB}mb` }));

// Static file serving for uploaded images
app.use('/uploads', express.static(UPLOADS_DIR));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/uploads', uploadsRouter);

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// Flush scheduler: buffer Redis → PostgreSQL every 30s
startFlushScheduler(async (docId, update) => {
  await query(
    `UPDATE documents SET yjs_state = $1, updated_at = NOW() WHERE id = $2`,
    [update, docId],
  );
});

// Global error handler — CORS headers must also be set here because Express
// error handlers bypass all previous middleware when called via next(err).
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  setCors(res);
  console.error(err.message);
  res.status(500).json({ error: err.message });
});

// Start REST API
app.listen(env.PORT, () => {
  console.log(`REST API listening on http://localhost:${env.PORT}`);
});

// Start Hocuspocus WebSocket server
hocuspocusServer.listen();
console.log(`Hocuspocus WS server listening on ws://localhost:${env.HOCUSPOCUS_PORT}`);
