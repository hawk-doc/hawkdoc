import { describe, it, expect, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app, closeConnections } from './test/helpers.js';
import * as health from './health.js';

afterAll(closeConnections);

describe('health check', () => {
  it('reports both dependencies when they are reachable', async () => {
    const res = await request(app).get('/healthz').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', postgres: 'ok', redis: 'ok' });
    expect(typeof res.body.ts).toBe('string');
  });

  it('answers 503 when a dependency is down', async () => {
    vi.spyOn(health, 'checkHealth').mockResolvedValue({ postgres: 'ok', redis: 'down' });
    const res = await request(app).get('/healthz').expect(503);
    expect(res.body).toMatchObject({ status: 'degraded', postgres: 'ok', redis: 'down' });
  });

  it('shares one probe between concurrent callers', async () => {
    // A hanging dependency must not let repeated polling pile up queries
    const probes = await Promise.all(Array.from({ length: 5 }, () => health.checkHealth()));
    expect(new Set(probes).size).toBe(1);
  });

  it('runs a fresh probe once the previous one has settled', async () => {
    const first = await health.checkHealth();
    const second = await health.checkHealth();
    expect(second).not.toBe(first);
    expect(second).toMatchObject({ postgres: 'ok', redis: 'ok' });
  });
});
