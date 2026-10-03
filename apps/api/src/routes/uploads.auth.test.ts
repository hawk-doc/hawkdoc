import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, signUp, closeConnections } from '../test/helpers.js';

afterAll(closeConnections);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe('POST /api/uploads auth', () => {
  it('rejects requests without a token', async () => {
    await request(app).post('/api/uploads').attach('image', PNG, { filename: 'a.png', contentType: 'image/png' }).expect(401);
  });

  it('rejects an invalid token', async () => {
    await request(app)
      .post('/api/uploads')
      .set('Authorization', 'Bearer nope')
      .attach('image', PNG, { filename: 'a.png', contentType: 'image/png' })
      .expect(401);
  });

  it('accepts an image from a signed-in user', async () => {
    const user = await signUp();
    const res = await request(app)
      .post('/api/uploads')
      .set(user.auth)
      .attach('image', PNG, { filename: 'a.png', contentType: 'image/png' })
      .expect(200);
    expect((res.body as { url: string }).url).toMatch(/^\/uploads\/.+\.png$/);
  });
});
