import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, closeConnections } from '../test/helpers.js';

afterAll(closeConnections);

let counter = 0;
function freshEmail(): string {
  counter += 1;
  return `Vitest-Case-${Date.now()}-${counter}@Example.test`;
}

describe('email handling', () => {
  it('signs in regardless of how the address is capitalised', async () => {
    const email = freshEmail();
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123', name: 'Case' })
      .expect(201);
    expect((registered.body as { user: { email: string } }).user.email).toBe(email.toLowerCase());

    await request(app).post('/api/auth/login').send({ email: email.toUpperCase(), password: 'password123' }).expect(200);
    await request(app).post('/api/auth/login').send({ email: ` ${email.toLowerCase()} `, password: 'password123' }).expect(200);
  });

  it('refuses a second account that differs only by case', async () => {
    const email = freshEmail();
    await request(app).post('/api/auth/register').send({ email, password: 'password123', name: 'One' }).expect(201);
    await request(app)
      .post('/api/auth/register')
      .send({ email: email.toLowerCase(), password: 'password123', name: 'Two' })
      .expect(409);
  });
});
