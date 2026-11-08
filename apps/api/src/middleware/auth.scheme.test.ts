import { describe, it, afterAll } from 'vitest';
import request from 'supertest';
import { app, signUp, closeConnections } from '../test/helpers.js';

afterAll(closeConnections);

describe('Authorization header scheme', () => {
  it.each(['Bearer', 'bearer', 'BEARER'])('accepts the "%s" scheme', async (scheme) => {
    const user = await signUp();
    await request(app).get('/api/documents').set('Authorization', `${scheme} ${user.token}`).expect(200);
  });

  it.each(['Basic abc', 'Bearer', 'Bearer ', 'Bearertoken', 'Bearer a b'])(
    'rejects "%s"',
    async (header) => {
      await request(app).get('/api/documents').set('Authorization', header).expect(401);
    },
  );
});
