import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import fs from 'fs';
import { UPLOADS_DIR, MAX_UPLOAD_SIZE_BYTES, ALLOWED_IMAGE_TYPES } from '../constants/upload.js';

export { UPLOADS_DIR };

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// The mimetype comes from the client, so confirm the file's leading bytes
// actually match the format it claims to be.
function hasImageSignature(header: Buffer, mimetype: string): boolean {
  switch (mimetype) {
    case 'image/png':
      return header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(header.toString('latin1', 0, 6));
    case 'image/webp':
      return header.toString('latin1', 0, 4) === 'RIFF' && header.toString('latin1', 8, 12) === 'WEBP';
    default:
      return false;
  }
}

async function readHeader(filePath: string): Promise<Buffer> {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buf, 0, 12, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

class UnsupportedFileTypeError extends Error {
  constructor() {
    super('Unsupported image type. Allowed: PNG, JPEG, GIF, WebP');
  }
}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${ALLOWED_IMAGE_TYPES[file.mimetype]}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (Object.hasOwn(ALLOWED_IMAGE_TYPES, file.mimetype)) {
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

    readHeader(file.path)
      .then(async (header) => {
        if (hasImageSignature(header, file.mimetype)) {
          res.json({ url: `/uploads/${file.filename}` });
          return;
        }
        await fs.promises.unlink(file.path);
        res.status(415).json({ error: new UnsupportedFileTypeError().message });
      })
      .catch(next);
  });
});
