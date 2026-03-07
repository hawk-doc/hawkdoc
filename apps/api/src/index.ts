import express from 'express';
import { env } from './env.js';
import { authRouter } from './routes/auth.js';
import { documentsRouter } from './routes/documents.js';
import { hocuspocusServer } from './hocuspocus.js';
import { startFlushScheduler } from './redis.js';
import { query } from './db.js';

const app = express();

// Middleware
app.use(express.json({ limit: `${env.MAX_FILE_SIZE_MB}mb` }));
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  next();
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/documents', documentsRouter);

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

// Start REST API
app.listen(env.PORT, () => {
  console.log(`REST API listening on http://localhost:${env.PORT}`);
});

// Start Hocuspocus WebSocket server
hocuspocusServer.listen();
console.log(`Hocuspocus WS server listening on ws://localhost:${env.HOCUSPOCUS_PORT}`);
