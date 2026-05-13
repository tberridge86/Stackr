import express from 'express';
import fetch from 'node-fetch';
import FormData from 'form-data';

const router = express.Router();

const GIBL_ENDPOINT = process.env.GIBLTCG_ENDPOINT || 'https://gibltcg.com/api/v1/predict-card';

function getGiblKey() {
  return process.env.GIBLTCG_API_KEY || process.env.GIBL_API_KEY || '';
}

function pickNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const match = text.match(/\d+/);
  return match ? match[0] : null;
}

function normaliseIdentity(raw) {
  const firstItem = Array.isArray(raw?.items) ? raw.items[0] : null;
  const best = firstItem?.card?.identity?.best ?? raw?.card?.identity?.best ?? null;
  const match = best?.match ?? raw?.match ?? {};

  const legacyIdentity = Array.isArray(raw?.identity) ? raw.identity[0] : null;

  return {
    provider: 'gibl',
    name: match?.name ?? raw?.name ?? null,
    number: pickNumber(match?.number ?? raw?.number),
    printedTotal: pickNumber(match?.printedTotal ?? match?.printed_total ?? raw?.printedTotal),
    set: match?.set ?? match?.setName ?? raw?.set ?? null,
    confidence:
      best?.confidence ??
      firstItem?.card?.identity?.confidence ??
      legacyIdentity?.card_identity_confidence ??
      null,
    cardType: firstItem?.card?.type?.label ?? raw?.card_type ?? null,
    isCard: raw?.is_card ?? firstItem?.card?.type?.label ?? null,
    raw,
  };
}

router.get('/identify', (_req, res) => {
  res.json({
    ok: true,
    provider: 'gibl',
    configured: Boolean(getGiblKey()),
    endpoint: GIBL_ENDPOINT,
  });
});

router.post('/identify', async (req, res) => {
  const startedAt = Date.now();

  try {
    const { base64Image } = req.body ?? {};
    const key = getGiblKey();

    if (!key) {
      return res.status(500).json({ error: 'Missing GIBLTCG_API_KEY' });
    }

    if (!base64Image || typeof base64Image !== 'string') {
      return res.status(400).json({ error: 'Missing base64Image' });
    }

    const imageBuffer = Buffer.from(base64Image, 'base64');
    if (!imageBuffer || imageBuffer.length < 1024) {
      return res.status(400).json({ error: 'Decoded image too small' });
    }

    const url = `${GIBL_ENDPOINT}?key=${encodeURIComponent(key)}`;
    const form = new FormData();
    form.append('file', imageBuffer, {
      filename: 'stackr-scan.jpg',
      contentType: 'image/jpeg',
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: form.getHeaders(),
      body: form,
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { rawText: text };
    }

    if (!response.ok) {
      console.log(`[gibl] failed status=${response.status} total=${Date.now() - startedAt}ms`);
      return res.status(response.status).json({
        error: 'GiblTCG identification failed',
        status: response.status,
        details: data,
      });
    }

    const payload = normaliseIdentity(data);
    if (!payload.name && !payload.number && !payload.printedTotal) {
      console.log(`[gibl] no_match total=${Date.now() - startedAt}ms`);
      return res.status(404).json({
        error: 'No card detected',
        raw: data,
      });
    }

    console.log(
      `[gibl] ok total=${Date.now() - startedAt}ms conf=${payload.confidence ?? 'n/a'} card=${payload.name ?? 'unknown'} #${payload.number ?? '?'}`
    );

    return res.json(payload);
  } catch (error) {
    console.error(`[gibl] error total=${Date.now() - startedAt}ms`, error);
    return res.status(500).json({
      error: 'GiblTCG identification failed',
      details: error?.message ?? String(error),
    });
  }
});

export default router;
