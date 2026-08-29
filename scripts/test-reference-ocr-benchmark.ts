import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  evaluateReferenceOcrCase,
  findDuplicateReferenceImages,
  parseReferenceCardQuery,
  resolveReferenceCardQuery,
  summariseReferenceOcrCases,
  toHiresReferenceUrl,
  validateReferenceImage,
  type ReferenceCatalogueCard,
} from './reference-ocr-benchmark-core';
import { downloadReferenceImage } from './reference-image-downloader';

const cards: ReferenceCatalogueCard[] = [
  {
    id: 'base1-4',
    name: 'Charizard',
    language: 'en',
    setId: 'base1',
    setName: 'Base',
    number: '4',
    printedTotal: 102,
    rarity: 'Rare Holo',
    imageSmall: 'https://images.pokemontcg.io/base1/4.png',
  },
  {
    id: 'base2-4',
    name: 'Jolteon',
    language: 'en',
    setId: 'base2',
    setName: 'Jungle',
    number: '4',
    printedTotal: 64,
    rarity: 'Rare Holo',
    imageSmall: 'https://images.pokemontcg.io/base2/4.png',
  },
  ...['125', '215', '223', '228'].map((number, index) => ({
    id: `sv3-${number}`,
    name: 'Charizard ex',
    language: 'en',
    setId: 'sv3',
    setName: 'Obsidian Flames',
    number,
    printedTotal: 197,
    rarity: ['Double Rare', 'Ultra Rare', 'Special Illustration Rare', 'Hyper Rare'][index],
    imageSmall: `https://images.pokemontcg.io/sv3/${number}.png`,
  })),
];

function testHumanQueryResolvesEveryPrinting() {
  const parsed = parseReferenceCardQuery('Charizard from Obsidian Flames');
  assert.equal(parsed.cardPhrase, 'charizard');
  assert.equal(parsed.setPhrase, 'obsidian flames');

  const matches = resolveReferenceCardQuery(cards, 'Charizard from Obsidian Flames');
  assert.deepEqual(
    matches.map((match) => match.card.id),
    ['sv3-125', 'sv3-215', 'sv3-223', 'sv3-228'],
    'An informal name and set must resolve to every printing instead of silently choosing one.',
  );
  assert(matches.every((match) => match.reasons.includes('exact-set')));
}

function testExactIdResolvesOnePrinting() {
  const matches = resolveReferenceCardQuery(cards, 'sv3-223');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].card.id, 'sv3-223');
  assert.deepEqual(matches[0].reasons, ['exact-card-id']);
}

function testHiresUrlConstruction() {
  assert.equal(
    toHiresReferenceUrl('https://images.pokemontcg.io/sv3/223.png'),
    'https://images.pokemontcg.io/sv3/223_hires.png',
  );
  assert.equal(
    toHiresReferenceUrl('https://assets.tcgdex.net/en/sv/sv03/223'),
    'https://assets.tcgdex.net/en/sv/sv03/223/high.webp',
  );
}

function testImageIntegrityValidationAndDuplicateDetection() {
  const body = Buffer.alloc(12_000, 7);
  const valid = validateReferenceImage({
    responseStatus: 200,
    contentType: 'image/png; charset=binary',
    body,
    metadata: { width: 600, height: 825, format: 'png' },
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.sha256, createHash('sha256').update(body).digest('hex'));
  assert.equal(valid.contentType, 'image/png');

  const html = validateReferenceImage({
    responseStatus: 200,
    contentType: 'text/html',
    body,
    metadata: { width: null, height: null, format: null },
  });
  assert.equal(html.valid, false);
  assert(html.errors.includes('content-type:text/html'));
  assert(html.errors.includes('image-decode-missing-dimensions'));

  const disguisedJpeg = validateReferenceImage({
    responseStatus: 200,
    contentType: 'image/png',
    body,
    metadata: { width: 600, height: 825, format: 'jpeg' },
  });
  assert.equal(disguisedJpeg.valid, false);
  assert(disguisedJpeg.errors.includes('content-type-format-mismatch:png:jpeg'));

  const truncated = validateReferenceImage({
    responseStatus: 200,
    contentType: 'image/png',
    body: Buffer.alloc(40),
    metadata: { width: 600, height: 825, format: 'png' },
  });
  assert.equal(truncated.valid, false);
  assert(truncated.errors.includes('image-too-small:40'));

  const wrongAspect = validateReferenceImage({
    responseStatus: 200,
    contentType: 'image/png',
    body,
    metadata: { width: 825, height: 600, format: 'png' },
  });
  assert.equal(wrongAspect.valid, false);
  assert(wrongAspect.errors.some((error) => error.startsWith('unexpected-card-aspect-ratio:')));

  const duplicates = findDuplicateReferenceImages([
    { cardId: 'sv3-223', validation: valid },
    { cardId: 'sv3-228', validation: valid },
    { cardId: 'broken', validation: html },
  ]);
  assert.equal(duplicates.length, 1);
  assert.deepEqual(duplicates[0].cardIds, ['sv3-223', 'sv3-228']);
}

function testNumberAndTotalDisambiguateCollectorCollision() {
  const result = evaluateReferenceOcrCase({
    expectedCard: cards[0],
    catalogue: cards,
    viewId: 'clean',
    regions: [
      { role: 'name', text: 'Charizard' },
      { role: 'collector-number', text: '4/102' },
    ],
  });
  assert.equal(result.expectedRank, 1);
  assert.equal(result.top1, true);
  assert.equal(result.extractedCollectorNumber, true);
  assert.equal(result.extractedPrintedTotal, true);
  assert.equal(result.topCandidates[0].cardId, 'base1-4');
  assert(result.topCandidates[0].reasons.includes('number-total'));
}

function testOcrEvidenceNeverAutoAccepts() {
  const expectedCard = cards.find((card) => card.id === 'sv3-223')!;
  const result = evaluateReferenceOcrCase({
    expectedCard,
    catalogue: cards,
    viewId: 'clean',
    regions: [
      { role: 'name', text: 'Charizard ex' },
      { role: 'collector-number', text: '223/197' },
    ],
  });
  assert.equal(result.top1, true);
  assert.equal(result.automaticAcceptanceAllowed, false);
  assert.equal(result.evidenceLevel, 'ocr_candidate_retrieval_only');

  const summary = summariseReferenceOcrCases([result]);
  assert.equal(summary.top1Pct, 100);
  assert.equal(summary.top3Pct, 100);
  assert.equal(summary.automaticAcceptanceCount, 0);
  assert.deepEqual(summary.byView.map((item) => [item.viewId, item.top1Pct]), [['clean', 100]]);
  assert(summary.limitations.some((item) => item.includes('not evidence of real-camera accuracy')));
}

function response(status: number, body = Buffer.alloc(12_000, 3), contentType = 'image/png') {
  return new Response(body, {
    status,
    headers: {
      'content-type': contentType,
      'content-length': String(body.length),
    },
  });
}

async function testDownloaderFallsBackAfter404() {
  const calls: string[] = [];
  const result = await downloadReferenceImage({
    urls: ['https://example.test/card_hires.png', 'https://example.test/card.png'],
    fetchImpl: async (url) => {
      calls.push(url);
      return url.includes('_hires') ? response(404) : response(200);
    },
    decodeImage: async () => ({ width: 600, height: 825, format: 'png' }),
    sleep: async () => undefined,
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.url, 'https://example.test/card.png');
  assert.deepEqual(calls, ['https://example.test/card_hires.png', 'https://example.test/card.png']);
}

async function testDownloaderRetries429And500() {
  let rateLimitedCalls = 0;
  const recovered = await downloadReferenceImage({
    urls: ['https://example.test/card.png'],
    fetchImpl: async () => {
      rateLimitedCalls += 1;
      return rateLimitedCalls === 1 ? response(429) : response(200);
    },
    decodeImage: async () => ({ width: 600, height: 825, format: 'png' }),
    sleep: async () => undefined,
  });
  assert.equal(recovered.status, 'ready');
  assert.equal(rateLimitedCalls, 2);

  let serverErrorCalls = 0;
  const exhausted = await downloadReferenceImage({
    urls: ['https://example.test/card.png'],
    maxAttempts: 3,
    fetchImpl: async () => {
      serverErrorCalls += 1;
      return response(500);
    },
    decodeImage: async () => ({ width: 600, height: 825, format: 'png' }),
    sleep: async () => undefined,
  });
  assert.equal(exhausted.status, 'error');
  assert.equal(serverErrorCalls, 3);
  assert(exhausted.attempts.at(-1)?.validationErrors.includes('http-status:500'));
}

async function testDownloaderRejectsCorruptPixels() {
  const result = await downloadReferenceImage({
    urls: ['https://example.test/card.png'],
    fetchImpl: async () => response(200),
    decodeImage: async () => {
      throw new Error('invalid-png');
    },
    sleep: async () => undefined,
  });
  assert.equal(result.status, 'error');
  assert(result.attempts[0].validationErrors.some((error) => error.includes('decode-error:invalid-png')));
}

async function testDownloaderExhaustsNetworkTimeouts() {
  let calls = 0;
  const result = await downloadReferenceImage({
    urls: ['https://example.test/card.png'],
    maxAttempts: 2,
    fetchImpl: async () => {
      calls += 1;
      throw new Error('request-timeout');
    },
    decodeImage: async () => ({ width: 600, height: 825, format: 'png' }),
    sleep: async () => undefined,
  });
  assert.equal(result.status, 'error');
  assert.equal(calls, 2);
  assert.equal(result.error, 'request-timeout');
}

async function main() {
  testHumanQueryResolvesEveryPrinting();
  testExactIdResolvesOnePrinting();
  testHiresUrlConstruction();
  testImageIntegrityValidationAndDuplicateDetection();
  testNumberAndTotalDisambiguateCollectorCollision();
  testOcrEvidenceNeverAutoAccepts();
  await testDownloaderFallsBackAfter404();
  await testDownloaderRetries429And500();
  await testDownloaderRejectsCorruptPixels();
  await testDownloaderExhaustsNetworkTimeouts();
  console.log('reference OCR benchmark tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
