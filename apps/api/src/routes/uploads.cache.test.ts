import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, signUp, closeConnections } from '../test/helpers.js';

afterAll(closeConnections);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe('GET /uploads caching', () => {
  it('serves uploaded images as immutable with a long max-age', async () => {
    const user = await signUp();
    const up = await request(app)
      .post('/api/uploads')
      .set(user.auth)
      .attach('image', PNG, { filename: 'a.png', contentType: 'image/png' })
      .expect(200);
    const res = await request(app).get((up.body as { url: string }).url).expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
