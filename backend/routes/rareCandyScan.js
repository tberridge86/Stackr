import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { pipeline, RawImage } from '@huggingface/transformers';

const router = express.Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..');
const PACK_ROOT = process.env.SCANNER_PACK_ROOT || path.join(BACKEND_ROOT, 'data/scanner-packs');
const DEFAULT_PACK_ID = process.env.SCANNER_PACK_ID || 'en-clip-base-v1';
const CLIP_MODEL = process.env.CLIP_MODEL || 'Xenova/clip-vit-base-patch32';
const ACCEPT_SIMILARITY = Number(process.env.RARE_CANDY_SCAN_ACCEPT_SIMILARITY || 0.62);
const ACCEPT_MARGIN = Number(process.env.RARE_CANDY_SCAN_ACCEPT_MARGIN || 0.015);
const MAX_CANDIDATES = Number(process.env.RARE_CANDY_SCAN_MAX_CANDIDATES || 8);

let packPromise = null;
let extractorPromise = null;

function getPackDir(packId = DEFAULT_PACK_ID) {
  const cleanId = String(packId || DEFAULT_PACK_ID).replace(/[^a-zA-Z0-9._-]/g, '');
  return path.join(PACK_ROOT, cleanId);
}

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline('image-feature-extraction', CLIP_MODEL);
  }
  return extractorPromise;
}

function normalizeVector(values) {
  let norm = 0;
  for (const value of values) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return Float32Array.from(values, (value) => value / norm);
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textContainsCardName(text, name) {
  const normalizedText = normalizeText(text);
  const normalizedName = normalizeText(name);
  if (!normalizedText || normalizedName.length < 3) return false;
  const escaped = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^| )${escaped}(?: |$)`).test(normalizedText);
}

function parsePrintedNumber(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    const number = Number(value.number);
    const total = Number(value.total);
    return Number.isFinite(number) && Number.isFinite(total) ? { number, total } : null;
  }

  const match = String(value)
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .match(/\b(\d{1,3})\s*\/\s*(\d{2,3})\b/);
  if (!match) return null;
  const number = Number(match[1]);
  const total = Number(match[2]);
  return Number.isFinite(number) && Number.isFinite(total) ? { number, total } : null;
}

async function embedImage(base64Image) {
  const extractor = await getExtractor();
  const cleanBase64 = String(base64Image || '').replace(/^data:image\/\w+;base64,/, '');
  const blob = new Blob([Buffer.from(cleanBase64, 'base64')], { type: 'image/jpeg' });
  const image = await RawImage.fromBlob(blob);
  const tensor = await extractor(image);
  return normalizeVector(tensor.data);
}

async function loadPack() {
  if (packPromise) return packPromise;

  packPromise = (async () => {
    const packDir = getPackDir();
    const manifest = JSON.parse(await fs.readFile(path.join(packDir, 'manifest.json'), 'utf8'));
    const vectorBuffer = await fs.readFile(path.join(packDir, manifest.vectorFile || 'vectors.i8'));
    const dimensions = Number(manifest.dimensions);
    const cardCount = Number(manifest.cardCount || manifest.cards?.length || 0);

    if (!dimensions || !cardCount || vectorBuffer.length < dimensions * cardCount) {
      throw new Error('Invalid scanner pack');
    }

    console.log(`[rare-candy-scan] pack loaded id=${manifest.id} cards=${cardCount} dims=${dimensions}`);
    return {
      manifest,
      vectors: new Int8Array(vectorBuffer.buffer, vectorBuffer.byteOffset, dimensions * cardCount),
      dimensions,
      cardCount,
    };
  })();

  return packPromise;
}

function toScannedCard(card) {
  return {
    id: card.id,
    name: card.name,
    number: card.number ?? '',
    set_id: card.setId,
    set_name: card.setName,
    set_printed_total: card.printedTotal ?? null,
    image_small: card.imageSmall ?? '',
    rarity: card.rarity ?? '',
  };
}

function getCardEvidence(card, hints) {
  const cardNumber = Number.parseInt(card?.number ?? '', 10);
  const printedNumber = hints.printedNumber;
  const nameMatch = textContainsCardName(hints.nameHint, card?.name);
  const setMatch = Boolean(hints.setId && card?.setId === hints.setId);
  const totalMatch = Boolean(
    printedNumber?.total
    && Number(card?.printedTotal) === Number(printedNumber.total)
  );
  const numberExact = Boolean(
    printedNumber?.number
    && Number.isFinite(cardNumber)
    && cardNumber === Number(printedNumber.number)
  );
  const numberSuffix = Boolean(
    printedNumber?.number
    && printedNumber.number < 100
    && Number.isFinite(cardNumber)
    && cardNumber > Number(printedNumber.total ?? 0)
    && String(cardNumber).endsWith(String(printedNumber.number))
  );

  return { nameMatch, setMatch, totalMatch, numberExact, numberSuffix };
}

function scorePack(queryEmbedding, pack, hints = {}) {
  const scores = [];
  const allowedSetId = String(hints.setId || '').trim();

  for (let cardIndex = 0; cardIndex < pack.cardCount; cardIndex += 1) {
    const card = pack.manifest.cards[cardIndex];
    if (allowedSetId && card?.setId !== allowedSetId) continue;

    const offset = cardIndex * pack.dimensions;
    let score = 0;
    for (let dim = 0; dim < pack.dimensions; dim += 1) {
      score += queryEmbedding[dim] * (pack.vectors[offset + dim] / 127);
    }

    const evidence = getCardEvidence(card, hints);
    let adjustedScore = score;
    const reasons = [];

    if (evidence.setMatch) {
      adjustedScore += 0.08;
      reasons.push('set');
    }
    if (evidence.totalMatch) {
      adjustedScore += 0.08;
      reasons.push('total');
    }
    if (evidence.numberExact) {
      adjustedScore += 0.12;
      reasons.push('number');
    }
    if (evidence.numberSuffix && !evidence.numberExact) {
      adjustedScore += 0.1;
      reasons.push('number-suffix');
    }
    if (evidence.nameMatch) {
      adjustedScore += 0.18;
      reasons.push('name');
    } else if (hints.nameHint) {
      adjustedScore -= 0.08;
      reasons.push('name-missing');
    }

    scores.push({ card, similarity: score, adjustedScore, evidence, reasons });
  }

  scores.sort((a, b) => b.adjustedScore - a.adjustedScore);
  return {
    candidates: scores.slice(0, Math.max(1, MAX_CANDIDATES)),
    nameMatchCount: scores.filter((item) => item.evidence.nameMatch).length,
  };
}

router.get('/identify', (_req, res) => {
  res.json({
    ok: true,
    provider: 'rare-candy-style',
    model: CLIP_MODEL,
    packId: DEFAULT_PACK_ID,
    configured: true,
  });
});

router.post('/identify', async (req, res) => {
  const startedAt = Date.now();

  try {
    const base64Image = typeof req.body?.base64Image === 'string' ? req.body.base64Image : '';
    const setId = String(req.body?.setId || '').trim();
    const nameHint = typeof req.body?.nameHint === 'string' ? req.body.nameHint : '';
    const printedNumber = parsePrintedNumber(req.body?.printedNumber);
    if (!base64Image) {
      return res.status(422).json({ error: 'Missing base64Image', provider: 'rare-candy-style' });
    }

    const [pack, queryEmbedding] = await Promise.all([
      loadPack(),
      embedImage(base64Image),
    ]);

    const scoredResult = scorePack(queryEmbedding, pack, { setId, nameHint, printedNumber });
    const scored = scoredResult.candidates;
    const best = scored[0] ?? null;
    const second = scored[1] ?? null;
    const similarity = best ? Number(best.similarity.toFixed(4)) : null;
    const margin = best && second ? Number((best.adjustedScore - second.adjustedScore).toFixed(4)) : best ? 1 : 0;
    const hasOcrSupport = Boolean(
      best?.evidence?.nameMatch
      && (
        best.evidence.setMatch
        || best.evidence.totalMatch
        || best.evidence.numberExact
        || best.evidence.numberSuffix
        || scoredResult.nameMatchCount === 1
      )
    );
    const visualAccepted = Boolean(best && best.similarity >= ACCEPT_SIMILARITY && margin >= ACCEPT_MARGIN);
    const nameOnlyAccepted = Boolean(
      best?.evidence?.nameMatch
      && scoredResult.nameMatchCount > 1
      && scoredResult.nameMatchCount <= 20
      && best.similarity >= 0.58
      && margin >= 0.05
    );
    const ocrAccepted = Boolean(
      best
      && (hasOcrSupport || nameOnlyAccepted)
      && best.similarity >= 0.55
      && margin >= 0.02
    );
    const accepted = visualAccepted || ocrAccepted;

    console.log('[rare-candy-scan] result', {
      card: best?.card?.name,
      set: best?.card?.setName,
      similarity,
      margin,
      adjustedScore: best ? Number(best.adjustedScore.toFixed(4)) : null,
      reasons: best?.reasons,
      nameMatchCount: scoredResult.nameMatchCount,
      accepted,
      candidates: scored.length,
      totalMs: Date.now() - startedAt,
    });

    return res.json({
      provider: 'rare-candy-style',
      match: accepted ? toScannedCard(best.card) : null,
      topMatch: best ? toScannedCard(best.card) : null,
      candidates: scored.map((item) => ({
        ...toScannedCard(item.card),
        similarity: Number(item.similarity.toFixed(4)),
        adjustedScore: Number(item.adjustedScore.toFixed(4)),
        reasons: item.reasons,
      })),
      similarity,
      margin,
      confidence: accepted ? Math.min(99, Math.round(similarity * 100)) : Math.max(0, Math.round((similarity ?? 0) * 100)),
      accepted,
      needsConfirmation: !accepted,
      totalMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error(`[rare-candy-scan] error total=${Date.now() - startedAt}ms`, error);
    return res.status(500).json({
      error: 'Rare Candy style scan failed',
      details: error?.message ?? String(error),
      provider: 'rare-candy-style',
    });
  }
});

loadPack().catch((error) => console.log(`[rare-candy-scan] pack warmup failed: ${error?.message ?? String(error)}`));
if (process.env.RARE_CANDY_SCAN_WARMUP !== 'false') {
  getExtractor()
    .then(() => console.log(`[rare-candy-scan] CLIP warmup ready model=${CLIP_MODEL}`))
    .catch((error) => console.log(`[rare-candy-scan] CLIP warmup failed: ${error?.message ?? String(error)}`));
}

export default router;
