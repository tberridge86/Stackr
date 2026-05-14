import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { pipeline, RawImage } from '@huggingface/transformers';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CLIP_MODEL = process.env.CLIP_MODEL || 'Xenova/clip-vit-base-patch32';
let clipExtractorPromise = null;
const candidateEmbeddingCache = new Map();
const CLIP_WARMUP_ON_BOOT = process.env.CLIP_WARMUP_ON_BOOT !== 'false';

function normaliseCardName(value) {
  return String(value ?? '').trim().toLowerCase();
}

function parsePrintedNumber(input) {
  if (!input) return null;

  if (typeof input === 'object') {
    const number = Number(input.number);
    const total = Number(input.total);
    if (Number.isFinite(number) && Number.isFinite(total)) return { number, total };
    return null;
  }

  const match = String(input).match(/\b(\d{1,3})\s*\/\s*(\d{2,3})\b/);
  if (!match) return null;

  const number = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(number) || !Number.isFinite(total)) return null;
  return { number, total };
}

function getSetPrintedTotal(card) {
  const raw = card?.raw_data ?? {};
  const total = Number(raw?.set?.printedTotal ?? raw?.set?.total ?? NaN);
  return Number.isFinite(total) ? total : null;
}

function formatCard(card) {
  const setPrintedTotal = getSetPrintedTotal(card);
  return {
    id: card.id,
    name: card.name,
    number: card.number ?? '',
    set_id: card.set_id,
    set_name: card.raw_data?.set?.name ?? card.set_id,
    set_printed_total: setPrintedTotal,
    image_small: card.image_small ?? '',
    rarity: card.rarity ?? '',
  };
}

function getClipExtractor() {
  if (!clipExtractorPromise) {
    clipExtractorPromise = pipeline('image-feature-extraction', CLIP_MODEL);
  }
  return clipExtractorPromise;
}

if (CLIP_WARMUP_ON_BOOT) {
  getClipExtractor()
    .then(() => console.log(`[local-ai] CLIP warmup ready model=${CLIP_MODEL}`))
    .catch((error) => console.log(`[local-ai] CLIP warmup failed: ${error?.message ?? String(error)}`));
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }

  if (!aNorm || !bNorm) return -1;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

async function embedScanImage(base64Image) {
  const extractor = await getClipExtractor();
  const blob = new Blob([Buffer.from(base64Image, 'base64')], { type: 'image/jpeg' });
  const image = await RawImage.fromBlob(blob);
  const tensor = await extractor(image);
  return tensor.data;
}

async function embedCandidateImage(card) {
  const { data: stored, error } = await supabase
    .from('card_clip_embeddings')
    .select('embedding, model')
    .eq('card_id', card.id)
    .eq('model', CLIP_MODEL)
    .maybeSingle();

  if (error) throw error;
  if (Array.isArray(stored?.embedding) && stored.embedding.length > 0) {
    return Float32Array.from(stored.embedding);
  }

  const url = card.image_large || card.image_small;
  if (!url) return null;

  const cached = candidateEmbeddingCache.get(url);
  if (cached) return cached;

  const extractor = await getClipExtractor();
  const image = await RawImage.fromURL(url);
  const tensor = await extractor(image);
  const embedding = tensor.data;
  candidateEmbeddingCache.set(url, embedding);
  return embedding;
}

async function rerankCandidatesWithClip(candidates, base64Image) {
  if (!base64Image || candidates.length <= 1) return null;

  const queryEmbedding = await embedScanImage(base64Image);
  const scored = [];

  for (const candidate of candidates) {
    const embedding = await embedCandidateImage(candidate);
    if (!embedding) continue;
    scored.push({
      candidate,
      similarity: cosineSimilarity(queryEmbedding, embedding),
    });
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored[0] ?? null;
}

router.get('/identify', (_req, res) => {
  res.json({
    ok: true,
    provider: 'local-ai',
    stages: {
      yolo: 'pending-model',
      clip: 'enabled',
      ocrResolver: 'enabled',
    },
  });
});

router.post('/identify', async (req, res) => {
  const startedAt = Date.now();

  try {
    const printedNumber = parsePrintedNumber(req.body?.printedNumber);
    const setId = String(req.body?.setId || '').trim();
    const nameHint = String(req.body?.nameHint || '').trim();
    const base64Image = typeof req.body?.base64Image === 'string' ? req.body.base64Image : '';

    if (!printedNumber) {
      return res.status(422).json({
        error: 'Missing printed number',
        provider: 'local-ai',
        stages: { ocrResolver: 'no-printed-number' },
      });
    }

    let query = supabase
      .from('pokemon_cards')
      .select('id, name, number, rarity, image_small, image_large, set_id, raw_data')
      .eq('number', String(printedNumber.number))
      .limit(250);

    if (setId) query = query.eq('set_id', setId);

    const { data, error } = await query;
    if (error) throw error;

    let candidates = (data ?? []).filter((card) => getSetPrintedTotal(card) === printedNumber.total);

    if (nameHint) {
      const exactName = candidates.filter((card) => normaliseCardName(card.name) === normaliseCardName(nameHint));
      if (exactName.length > 0) candidates = exactName;
    }

    let selected = candidates.length === 1 ? candidates[0] : null;
    let clipSimilarity = null;

    if (!selected && candidates.length > 1 && base64Image) {
      const clipBest = await rerankCandidatesWithClip(candidates, base64Image);
      if (clipBest?.candidate) {
        selected = clipBest.candidate;
        clipSimilarity = Number(clipBest.similarity.toFixed(4));
      }
    }

    const formatted = candidates.map(formatCard);
    const uniqueSets = [...new Set(formatted.map((card) => card.set_id))];
    const isExact = formatted.length === 1;
    const isClipResolved = Boolean(selected && !isExact);
    const confidence = isExact ? 99 : formatted.length > 1 ? 72 : 0;

    console.log(
      `[local-ai] ocr number=${printedNumber.number}/${printedNumber.total} set=${setId || 'any'} candidates=${formatted.length} total=${Date.now() - startedAt}ms`
    );

    if (formatted.length === 0) {
      return res.status(404).json({
        error: 'No OCR resolver match',
        provider: 'local-ai',
        printedNumber,
        stages: { ocrResolver: 'no-match' },
      });
    }

    return res.json({
      provider: 'local-ai',
      match: selected ? formatCard(selected) : null,
      candidates: formatted.slice(0, 10),
      confidence: isExact ? confidence : isClipResolved ? 88 : confidence,
      printedNumber,
      needsVisualRerank: !selected,
      clipSimilarity,
      uniqueSets,
      stages: {
        yolo: 'pending-model',
        clip: isExact ? 'not-needed' : isClipResolved ? 'resolved' : 'needed',
        ocrResolver: isExact ? 'exact' : 'ambiguous',
      },
    });
  } catch (error) {
    console.error(`[local-ai] error total=${Date.now() - startedAt}ms`, error);
    return res.status(500).json({
      error: 'Local AI scan failed',
      details: error?.message ?? String(error),
    });
  }
});

export default router;
