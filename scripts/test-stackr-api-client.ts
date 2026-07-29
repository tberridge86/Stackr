import assert from 'node:assert/strict';
import {
  StackrApiClient,
  type StackrRecognitionIdentifyResponse,
} from '../lib/stackrApiV1';

const identifyResponse: StackrRecognitionIdentifyResponse = {
  scanId: '00000000-0000-4000-8000-000000000001',
  matchStatus: 'probable',
  topCandidates: [{
    rank: 1,
    canonicalCardId: 'pokemon:en:sv1:001:normal',
    variantId: 'variant-1',
    setId: 'sv1',
    setCode: 'SV1',
    collectorNumber: '001',
    languageCode: 'en',
    variantCode: 'normal',
    cardName: 'Sprigatito',
    overallConfidence: 0.88,
    imageScore: 0.9,
    ocrScore: 0.8,
    setAndNumberScore: 1,
    componentScores: {
      image: 0.9,
      ocr: 0.8,
      setNumber: 1,
      cardName: 0.7,
      language: 1,
      rarityVariant: 0.5,
      perceptualHash: 0,
    },
    reasons: ['vector_candidate', 'collector_number_match'],
    uncertaintyFlags: ['variant_unconfirmed'],
  }],
  canonicalCardId: 'pokemon:en:sv1:001:normal',
  variantId: 'variant-1',
  overallConfidence: 0.88,
  imageScore: 0.9,
  ocrScore: 0.8,
  setAndNumberScore: 1,
  modelVersion: 'stackr-card-identity-onnx-v-test',
  indexVersion: 'index-test',
  scoringConfigVersion: 'scoring-test',
  reasons: ['probable_match'],
  uncertaintyFlags: ['variant_unconfirmed'],
  requestedNextAction: 'confirm_candidate',
  autoAddAllowed: false,
};

async function recognitionIdentifyUsesV1Contract() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new StackrApiClient({
    baseUrl: 'https://api.stackr.test/v1',
    fetchImpl: (async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({
        data: identifyResponse,
        meta: {
          requestId: 'request-test',
          apiVersion: '1',
          generatedAt: '2026-07-28T00:00:00.000Z',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch,
  });

  const result = await client.recognitionIdentify({
    modelVersion: 'stackr-card-identity-onnx-v-test',
    embedding: [1, 0],
    ocrText: '001/198',
    possibleCollectorNumber: '001',
    possibleSetCode: 'SV1',
    detectedLanguage: 'en',
    detectedScript: 'latin',
    captureQuality: {
      score: 0.92,
      focusScore: 0.91,
      glareScore: 0.1,
      exposureScore: 0.8,
      framingScore: 0.95,
      stabilityScore: 0.9,
      cardCoverage: 0.42,
      failureReasons: [],
    },
    client: {
      platform: 'ios',
      requestId: 'scan-test',
    },
  });

  assert.equal(result.data.matchStatus, 'probable');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.stackr.test/v1/recognition/identify');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal((calls[0].init.headers as Record<string, string>)['X-Stackr-Api-Version'], '1');
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.embedding, [1, 0]);
  assert.equal(body.privateImageKey, undefined);
  assert.equal(JSON.stringify(body).includes('base64'), false);
}

function recognitionIdentifyRejectsImagePayloads() {
  const client = new StackrApiClient({ baseUrl: 'https://api.stackr.test/v1' });
  assert.throws(() => {
    client.recognitionIdentify({
      modelVersion: 'stackr-card-identity-onnx-v-test',
      captureQuality: {
        score: 1,
        focusScore: 1,
        glareScore: 0,
        exposureScore: 1,
        framingScore: 1,
        stabilityScore: 1,
        cardCoverage: 0.5,
        failureReasons: [],
      },
      base64Image: 'data:image/jpeg;base64,abc',
    } as any);
  }, /private image keys/);
}

async function run() {
  await recognitionIdentifyUsesV1Contract();
  recognitionIdentifyRejectsImagePayloads();
  console.log('stackr api client checks passed');
}

void run();
