import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// Raster formats only. SVG is deliberately excluded: it can carry scripts, and
// uploads are served from the API's own origin. The stored file extension is
// derived from this map, never from the client's filename.
export const ALLOWED_IMAGE_TYPES: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};
