import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

describe('createApp error handling', () => {
  afterEach(() => vi.restoreAllMocks());

  it('answers 400 for a malformed JSON body without logging a server error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(createApp())
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Malformed JSON body' });
    expect(error).not.toHaveBeenCalled();
  });

  it('keeps CORS headers on the 400 response', async () => {
    const res = await request(createApp())
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Content-Type', 'application/json')
      .send('{');
    expect(res.status).toBe(400);
    expect(res.headers['access-control-allow-methods']).toBeDefined();
  });
});
