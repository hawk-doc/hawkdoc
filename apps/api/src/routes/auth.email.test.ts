import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import query from '../db.js';
import { env } from '../env.js';
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

  it('selects each legacy case-only duplicate by password and signs its identity', async () => {
    const email = freshEmail();
    const accounts = [
      { email, password: 'first-password', name: 'First' },
      { email: email.toLowerCase(), password: 'second-password', name: 'Second' },
      { email: email.toUpperCase(), password: 'third-password', name: 'Third' },
    ];
    for (const account of accounts) {
      await query('INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)', [
        account.email, await bcrypt.hash(account.password, 4), account.name,
      ]);
    }

    for (const account of accounts) {
      const expected = await query<{ id: string; email: string; name: string }>(
        'SELECT id, email, name FROM users WHERE email = $1', [account.email],
      );
      const response = await request(app).post('/api/auth/login')
        .send({ email: ` ${email.toUpperCase()} `, password: account.password }).expect(200);
      expect(response.body.user).toEqual(expected.rows[0]);
      expect(jwt.verify(response.body.token as string, env.JWT_SECRET)).toMatchObject({
        userId: expected.rows[0].id, email: account.email,
      });
    }

    const rejected = await request(app).post('/api/auth/login')
      .send({ email, password: 'wrong-password' }).expect(401);
    expect(rejected.body).toEqual({ error: 'Invalid credentials' });
  });

  it('rejects legacy case-only duplicates sharing a password', async () => {
    const email = freshEmail();
    for (const address of [email, email.toLowerCase()]) {
      await query('INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)', [
        address, await bcrypt.hash('shared-password', 4), 'Legacy',
      ]);
    }
    const response = await request(app).post('/api/auth/login')
      .send({ email, password: 'shared-password' }).expect(401);
    expect(response.body).toEqual({ error: 'Invalid credentials' });
  });

  it('rejects an unknown address with the existing credentials response', async () => {
    const response = await request(app).post('/api/auth/login')
      .send({ email: freshEmail(), password: 'password123' }).expect(401);
    expect(response.body).toEqual({ error: 'Invalid credentials' });
  });
});
