import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import type { AuthPayload, AuthenticatedRequest } from '../interfaces/index.js';

export type { AuthPayload, AuthenticatedRequest };

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // RFC 7235: the auth scheme name is case-insensitive ("bearer" is valid).
  const match = /^Bearer +(\S+)$/i.exec(req.header('authorization') ?? '');
  if (!match) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = match[1];
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    (req as AuthenticatedRequest).auth = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}
