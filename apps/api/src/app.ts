import express, { type Request, type Response, type NextFunction } from 'express';
import { env } from './env.js';
import { authRouter } from './routes/auth.js';
import { documentsRouter } from './routes/documents.js';
import { uploadsRouter, UPLOADS_DIR } from './routes/uploads.js';

/**
 * Builds the Express app without starting any listeners, so tests can mount
 * it directly. index.ts owns the servers and the shutdown handling.
 */
export function createApp() {
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

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });
  // Global error handler — CORS headers must also be set here because Express
  // error handlers bypass all previous middleware when called via next(err).
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    setCors(req, res);
    console.error(err);
    const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
    res.status(500).json({ error: message });
  });

  return app;
}
