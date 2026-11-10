import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, closeConnections } from './test/helpers.js';

afterAll(closeConnections);

describe('response headers', () => {
  it('does not advertise the framework', async () => {
    const res = await request(app).get('/healthz');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sends nosniff on API, error and preflight responses', async () => {
    const ok = await request(app).get('/healthz');
    const unauth = await request(app).get('/api/documents').expect(401);
    const preflight = await request(app).options('/api/documents').expect(204);
    for (const res of [ok, unauth, preflight]) {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    }
  });
});
