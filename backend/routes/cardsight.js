import express from 'express';
import { Buffer } from 'buffer';
import { CardSightAI } from 'cardsightai';

const router = express.Router();

const client = new CardSightAI({
  apiKey: process.env.CARDSIGHTAI_API_KEY,
});

router.get('/identify', (req, res) => {
  res.json({
    ok: true,
    message: 'CardSight route is connected. Use POST to identify a card.',
  });
});

router.post('/identify', async (req, res) => {
  const startedAt = Date.now();

  try {
    const { base64Image } = req.body ?? {};

    if (!base64Image || typeof base64Image !== 'string') {
      return res.status(400).json({
        error: 'Missing base64Image',
      });
    }

    if (base64Image.length < 100) {
      return res.status(400).json({
        error: 'Invalid base64Image payload',
      });
    }

    const decodeStart = Date.now();
    const imageBuffer = Buffer.from(base64Image, 'base64');
    const decodeMs = Date.now() - decodeStart;

    if (!imageBuffer || imageBuffer.length < 1024) {
      return res.status(400).json({
        error: 'Decoded image too small',
      });
    }

    const aiStart = Date.now();
    const result = await client.identify.cardBySegment('pokemon', imageBuffer);
    const aiMs = Date.now() - aiStart;

    const detections = result?.data?.detections ?? [];

    if (!detections.length) {
      console.log(`[cardsight] no_detection decode=${decodeMs}ms ai=${aiMs}ms total=${Date.now() - startedAt}ms`);
      return res.status(404).json({
        error: 'No card detected',
      });
    }

    const mapStart = Date.now();
    const best = detections[0];
    const card = best.card ?? {};
    const payload = {
      name: card.name ?? null,
      number:
        card.number ??
        card.cardNumber ??
        card.collectorNumber ??
        null,
      set:
        card.releaseName ??
        card.setName ??
        card.set ??
        null,
      confidence: best.confidence ?? null,
      raw: result.data,
    };
    const mapMs = Date.now() - mapStart;

    console.log(
      `[cardsight] ok decode=${decodeMs}ms ai=${aiMs}ms map=${mapMs}ms total=${Date.now() - startedAt}ms conf=${payload.confidence ?? 'n/a'}`
    );

    return res.json(payload);
  } catch (error) {
    console.error(`[cardsight] error total=${Date.now() - startedAt}ms`, error);

    return res.status(500).json({
      error: 'CardSight identification failed',
      details: error?.message ?? String(error),
    });
  }
});

export default router;