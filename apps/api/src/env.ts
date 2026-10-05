import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOCUSPOCUS_PORT: z.coerce.number().default(3002),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(50),
  // Per client IP, per route, for /api/auth/login and /register
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  AUTH_RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(900),
  // Reverse proxies in front of the API (0 = none). Needed for req.ip, and so the
  // auth rate limiter, to see the client rather than the proxy
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
});

export const env = EnvSchema.parse(process.env);
