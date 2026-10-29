import { describe, it, expect, afterEach, vi } from 'vitest';
import { env } from './env.js';
import { createApp } from './app.js';

describe('createApp CORS config', () => {
  const original = env.ALLOWED_ORIGINS;

  afterEach(() => {
    env.ALLOWED_ORIGINS = original;
    vi.restoreAllMocks();
  });

  it('warns when ALLOWED_ORIGINS is empty', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    env.ALLOWED_ORIGINS = [];
    createApp();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ALLOWED_ORIGINS is empty'));
  });

  it('stays quiet when origins are configured', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    env.ALLOWED_ORIGINS = ['http://localhost:5173'];
    createApp();
    expect(warn).not.toHaveBeenCalled();
  });
});
