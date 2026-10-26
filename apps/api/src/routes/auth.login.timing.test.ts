import { describe, it, expect, afterAll, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app, closeConnections } from '../test/helpers.js';

afterAll(closeConnections);

describe('login with an unknown email', () => {
  it('still runs a bcrypt comparison so it is not faster than a wrong password', async () => {
    const compare = vi.spyOn(bcrypt, 'compare');
    try {
      await request(app)
        .post('/api/auth/login')
        .send({ email: `nobody-${Date.now()}@example.test`, password: 'password123' })
        .expect(401);
      expect(compare).toHaveBeenCalledTimes(1);
    } finally {
      compare.mockRestore();
    }
  });
});
