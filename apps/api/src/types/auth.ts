import type { Request } from 'express';

export interface AuthPayload {
  userId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthPayload;
}
