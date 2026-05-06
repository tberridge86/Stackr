import express from 'express';
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
  try {
    const { base64Image } = req.body;

    if (!base64Image) {
      return res.status(400).json({
        error: 'Missing base64Image',
      });
    }

    const imageBuffer = Buffer.from(base64Image, 'base64');

    // IMPORTANT:
    // segment FIRST
    // image SECOND

    const result = await client.identify.cardBySegment(
      'pokemon',
      imageBuffer
    );

    console.log('CardSight result:', JSON.stringify(result, null, 2));

    const detections = result?.data?.detections ?? [];

    if (!detections.length) {
      return res.status(404).json({
        error: 'No card detected',
      });
    }

    const best = detections[0];
    const card = best.card ?? {};

    return res.json({
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
    });

  } catch (error) {
    console.error('CardSight identify error:', error);

    return res.status(500).json({
      error: 'CardSight identification failed',
      details: error?.message ?? String(error),
    });
  }
});

export default router;