import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRateLimiter } from './rateLimit.js';

/**
 * Creates a test app with a rate-limited POST /x route and a 60-second window.
 * @param max - Requests allowed per client IP within each window.
 * @param now - Clock returning the current time in milliseconds.
 * @returns An Express app that responds with 204 to requests within the limit.
 */
function appWith(max: number, now: () => number) {
  const app = express();
  app.post('/x', createRateLimiter({ max, windowMs: 60_000, now }), (_req, res) => {
    res.sendStatus(204);
  });
  return app;
}

describe('createRateLimiter', () => {
  it('allows up to max requests, then answers 429 with Retry-After', async () => {
    const app = appWith(2, () => 0);
    await request(app).post('/x').expect(204);
    await request(app).post('/x').expect(204);
    const res = await request(app).post('/x').expect(429);
    expect(res.headers['retry-after']).toBe('60');
    expect(res.body.error).toMatch(/too many/i);
  });

  it('starts a fresh window once the old one has expired', async () => {
    let time = 0;
    const app = appWith(1, () => time);
    await request(app).post('/x').expect(204);
    await request(app).post('/x').expect(429);
    time = 60_000;
    await request(app).post('/x').expect(204);
  });

  it('reports the time left in the window', async () => {
    let time = 0;
    const app = appWith(1, () => time);
    await request(app).post('/x').expect(204);
    time = 45_500;
    const res = await request(app).post('/x').expect(429);
    expect(res.headers['retry-after']).toBe('15');
  });

  it('counts clients separately by X-Forwarded-For when trust proxy is set', async () => {
    const app = appWith(1, () => 0);
    app.set('trust proxy', 1);
    await request(app).post('/x').set('X-Forwarded-For', '1.1.1.1').expect(204);
    await request(app).post('/x').set('X-Forwarded-For', '2.2.2.2').expect(204);
    await request(app).post('/x').set('X-Forwarded-For', '1.1.1.1').expect(429);
  });

  it('ignores X-Forwarded-For when trust proxy is off', async () => {
    const app = appWith(1, () => 0);
    await request(app).post('/x').set('X-Forwarded-For', '1.1.1.1').expect(204);
    await request(app).post('/x').set('X-Forwarded-For', '2.2.2.2').expect(429);
  });
});
