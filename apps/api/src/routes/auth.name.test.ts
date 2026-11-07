import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, closeConnections } from '../test/helpers.js';

afterAll(closeConnections);

let counter = 0;
function freshEmail(): string {
  counter += 1;
  return `vitest-name-${Date.now()}-${counter}@example.test`;
}

describe('register name', () => {
  it('rejects a name made only of spaces', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: freshEmail(), password: 'password123', name: '    ' })
      .expect(400);
  });

  it('stores the name without surrounding whitespace', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: freshEmail(), password: 'password123', name: '  Ada Lovelace  ' })
      .expect(201);
    expect((response.body as { user: { name: string } }).user.name).toBe('Ada Lovelace');
  });
});
