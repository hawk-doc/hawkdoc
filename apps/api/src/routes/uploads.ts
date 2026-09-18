import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  UPLOADS_DIR,
  MAX_UPLOAD_SIZE_BYTES,
  IMAGE_MIME_TYPES,
  IMAGE_EXTENSIONS,
  type ImageMimeType,
} from '../constants/upload.js';

export { UPLOADS_DIR };

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ImageMimeSchema = z.enum(IMAGE_MIME_TYPES);

// The mimetype comes from the client, so confirm the file's leading bytes
// actually match the format it claims to be.
function hasImageSignature(data: Buffer, mimetype: ImageMimeType): boolean {
  switch (mimetype) {
    case 'image/png':
      return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(data.toString('latin1', 0, 6));
    case 'image/webp':
      return data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP';
  }
}

class UnsupportedFileTypeError extends Error {
  constructor() {
    super('Unsupported image type. Allowed: PNG, JPEG, GIF, WebP');
  }
}

// Buffer in memory (capped by MAX_UPLOAD_SIZE_BYTES) so nothing reaches the
// publicly served UPLOADS_DIR until its contents have been verified.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ImageMimeSchema.safeParse(file.mimetype).success) {
      cb(null, true);
    } else {
      cb(new UnsupportedFileTypeError());
    }
  },
});

export const uploadsRouter = Router();

// TODO: add requireAuth once auth UI is built
uploadsRouter.post('/', (req: Request, res: Response, next) => {
  upload.single('image')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : err.message;
      res.status(status).json({ error: message });
      return;
    }
    if (err instanceof UnsupportedFileTypeError) {
      res.status(415).json({ error: err.message });
      return;
    }
    if (err) { next(err); return; }
    const file = req.file;
    if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }

    const mimetype = ImageMimeSchema.safeParse(file.mimetype);
    if (!mimetype.success || !hasImageSignature(file.buffer, mimetype.data)) {
      res.status(415).json({ error: new UnsupportedFileTypeError().message });
      return;
    }

    const filename = `${randomUUID()}${IMAGE_EXTENSIONS[mimetype.data]}`;
    fs.promises.writeFile(path.join(UPLOADS_DIR, filename), file.buffer, { flag: 'wx' })
      .then(() => { res.json({ url: `/uploads/${filename}` }); })
      .catch(next);
  });
});
