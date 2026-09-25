import request from 'supertest';
import { createApp } from '../app.js';
import { pool } from '../db.js';
import { redis } from '../redis.js';

export const app = createApp();

export interface TestUser {
  token: string;
  id: string;
  auth: { Authorization: string };
}

let counter = 0;

/** Registers a fresh user so tests never collide over documents */
export async function signUp(): Promise<TestUser> {
  counter += 1;
  const email = `vitest-${Date.now()}-${counter}@example.test`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123', name: 'Vitest' })
    .expect(201);
  const { token, user } = res.body as { token: string; user: { id: string } };
  return { token, id: user.id, auth: { Authorization: `Bearer ${token}` } };
}

export async function createDoc(user: TestUser, title: string): Promise<{ id: string; title: string }> {
  const res = await request(app).post('/api/documents').set(user.auth).send({ title }).expect(201);
  return res.body as { id: string; title: string };
}

export async function listDocs(user: TestUser, trash = false): Promise<string[]> {
  const res = await request(app)
    .get(trash ? '/api/documents?trash=true' : '/api/documents')
    .set(user.auth)
    .expect(200);
  return (res.body as { title: string }[]).map((d) => d.title);
}

/** Closes the pools so vitest can exit */
export async function closeConnections(): Promise<void> {
  await redis.quit();
  await pool.end();
}
