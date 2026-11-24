import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, type AuthRequest } from '../auth.ts';

const router = Router();
const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

router.post('/', requireAuth, (req: AuthRequest, res) => {
  const { dataUrl } = req.body ?? {};
  if (typeof dataUrl !== 'string') {
    res.status(400).json({ error: 'Image data is required.' });
    return;
  }

  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    res.status(400).json({ error: 'Only PNG, JPEG, or WebP images are permitted.' });
    return;
  }

  const mime = match[1];
  const ext = MIME_EXT[mime];
  const buffer = Buffer.from(match[2], 'base64');

  if (buffer.byteLength === 0 || buffer.byteLength > 2 * 1024 * 1024) {
    res.status(400).json({ error: 'Image size must be under 2 MB.' });
    return;
  }

  const filename = `${crypto.randomUUID()}.${ext}`;
  const targetPath = path.resolve(uploadDir, filename);
  if (!targetPath.startsWith(uploadDir + path.sep)) {
    res.status(400).json({ error: 'Invalid upload path.' });
    return;
  }

  fs.writeFileSync(targetPath, buffer);
  res.status(201).json({ url: `/api/uploads/${filename}` });
});

router.get('/:filename', (req, res) => {
  const raw = req.params.filename;
  if (!/^[0-9a-f-]+\.(jpg|png|webp)$/i.test(raw)) {
    res.status(400).json({ error: 'Invalid filename.' });
    return;
  }
  const targetPath = path.resolve(uploadDir, raw);
  if (!targetPath.startsWith(uploadDir + path.sep) || !fs.existsSync(targetPath)) {
    res.status(404).json({ error: 'Image not found.' });
    return;
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(targetPath);
});

export default router;
