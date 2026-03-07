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
});

export const env = EnvSchema.parse(process.env);
