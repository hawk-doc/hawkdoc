import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadImage } from './documentApi';

const file = new File(['x'], 'pic.png', { type: 'image/png' });

afterEach(() => { vi.unstubAllGlobals(); });

describe('uploadImage', () => {
  it('asks the user to sign in when there is no token', async () => {
    await expect(uploadImage(file, null)).rejects.toThrow('Sign in to upload images');
  });

  it("reports the API's own error message", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'File too large' }), { status: 413 }),
    ));
    await expect(uploadImage(file, 'tok')).rejects.toThrow('File too large');
  });

  it('falls back to the status when the body is not the API error shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })));
    await expect(uploadImage(file, 'tok')).rejects.toThrow('Upload failed (502)');
  });

  it('returns the uploaded url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: '/uploads/a.png' }))));
    await expect(uploadImage(file, 'tok')).resolves.toEqual({ url: '/uploads/a.png' });
  });
});
