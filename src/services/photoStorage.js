import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, '../../uploads/photos');

export async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

export async function savePhotoFromTwilio(mediaUrl, mediaContentType) {
  await ensureUploadDir();
  const ext = mediaContentType?.includes('png') ? 'png' : 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filepath = join(UPLOAD_DIR, filename);
  const response = await fetch(mediaUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(filepath, buffer);
  return `/uploads/photos/${filename}`;
}

export function getUploadDir() {
  return UPLOAD_DIR;
}
