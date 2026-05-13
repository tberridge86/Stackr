import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

router.get('/identify', (_req, res) => {
  res.json({
    ok: true,
    provider: 'local-ai',
    stages: {
      yolo: 'pending-model',
      clip: 'pending-model',
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

    if (!printedNumber) {
      return res.status(422).json({
        error: 'Missing printed number',
        provider: 'local-ai',
        stages: { ocrResolver: 'no-printed-number' },
      });
    }

    let query = supabase
      .from('pokemon_cards')
      .select('id, name, number, rarity, image_small, set_id, raw_data')
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

    const formatted = candidates.map(formatCard);
    const uniqueSets = [...new Set(formatted.map((card) => card.set_id))];
    const isExact = formatted.length === 1;
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
      match: isExact ? formatted[0] : null,
      candidates: formatted.slice(0, 10),
      confidence,
      printedNumber,
      needsVisualRerank: !isExact,
      uniqueSets,
      stages: {
        yolo: 'pending-model',
        clip: isExact ? 'not-needed' : 'needed',
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
