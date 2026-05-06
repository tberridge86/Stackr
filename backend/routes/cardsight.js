import express from 'express';
import FormData from 'form-data';

const router = express.Router();

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

    if (!process.env.CARDSIGHTAI_API_KEY) {
      return res.status(500).json({
        error: 'CardSight API key is not configured',
      });
    }

    const imageBuffer = Buffer.from(base64Image, 'base64');

    const form = new FormData();
    form.append('image', imageBuffer, {
      filename: 'card.jpg',
      contentType: 'image/jpeg',
    });
    form.append('game', 'pokemon');

    const response = await fetch('https://api.cardsight.ai/v1/identify/card', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.CARDSIGHTAI_API_KEY,
        ...form.getHeaders(),
      },
      body: form,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('CardSight API error:', data);
      return res.status(response.status).json({
        error: 'CardSight identification failed',
        details: data,
      });
    }

    console.log('CardSight response:', JSON.stringify(data, null, 2));

    const detections =
      data?.data?.detections ??
      data?.detections ??
      data?.results ??
      [];

    if (!detections.length) {
      return res.status(404).json({
        error: 'No card detected',
        raw: data,
      });
    }

    const best = detections[0];
    const card = best.card ?? best;

    return res.json({
      name:
        card.name ??
        card.cardName ??
        card.title ??
        null,
      number:
        card.number ??
        card.cardNumber ??
        card.collectorNumber ??
        null,
      set:
        card.setName ??
        card.releaseName ??
        card.set ??
        null,
      year:
        card.year ??
        null,
      confidence:
        best.confidence ??
        best.score ??
        null,
      raw: data,
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