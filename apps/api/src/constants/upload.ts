import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
