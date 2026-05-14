import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..');
const PACK_ROOT = process.env.SCANNER_PACK_ROOT || path.join(BACKEND_ROOT, 'data/scanner-packs');
const DEFAULT_PACK_ID = process.env.SCANNER_PACK_ID || 'en-clip-base-v1';

function getPackDir(packId = DEFAULT_PACK_ID) {
  const cleanId = String(packId || DEFAULT_PACK_ID).replace(/[^a-zA-Z0-9._-]/g, '');
  return path.join(PACK_ROOT, cleanId);
}

router.get('/latest', (_req, res) => {
  const packId = DEFAULT_PACK_ID;
  const manifestPath = path.join(getPackDir(packId), 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: 'Scanner pack not built yet', packId });
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return res.json({
    id: manifest.id,
    language: manifest.language,
    model: manifest.model,
    quantization: manifest.quantization,
    dimensions: manifest.dimensions,
    cardCount: manifest.cardCount,
    generatedAt: manifest.generatedAt,
    manifestUrl: `/api/scanner-packs/${manifest.id}/manifest`,
    vectorsUrl: `/api/scanner-packs/${manifest.id}/vectors`,
  });
});

router.get('/:packId/manifest', (req, res) => {
  const filePath = path.join(getPackDir(req.params.packId), 'manifest.json');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Manifest not found' });
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.sendFile(filePath);
});

router.get('/:packId/vectors', (req, res) => {
  const filePath = path.join(getPackDir(req.params.packId), 'vectors.i8');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Vectors not found' });
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.sendFile(filePath);
});

export default router;
