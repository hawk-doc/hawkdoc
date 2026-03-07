import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { query } from '../db.js';
import { signToken } from '../middleware/auth.js';

export const authRouter = Router();

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

authRouter.post('/register', async (req, res) => {
  try {
    const body = RegisterSchema.parse(req.body);
    const hash = await bcrypt.hash(body.password, 12);

    const result = await query<{ id: string; email: string; name: string }>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name`,
      [body.email, hash, body.name],
    );

    const user = result.rows[0];
    const token = signToken({ userId: user.id, email: user.email });

    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.flatten() });
    } else if (err instanceof Error && err.message.includes('unique')) {
      res.status(409).json({ error: 'Email already registered' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const body = LoginSchema.parse(req.body);

    const result = await query<{
      id: string;
      email: string;
      name: string;
      password_hash: string;
    }>(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [body.email],
    );

    const user = result.rows[0];
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(body.password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signToken({ userId: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.flatten() });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});
