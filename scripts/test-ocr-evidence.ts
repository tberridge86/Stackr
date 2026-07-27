import assert from 'node:assert/strict';
import type { TextRecognitionResult } from '@react-native-ml-kit/text-recognition';
import {
  buildCandidateOnlyOcrEvidence,
  canOcrEvidenceDriveAutomaticExactMatch,
  collectOcrEvidence,
  collectorEvidenceConfidenceScore,
  normaliseCollectorNumberText,
  normaliseOcrEvidenceText,
  parseCollectorNumberEvidence,
  selectOcrScriptsForCard,
  shouldReadCardNameRegion,
  type OcrRegionRecognitionRequest,
} from '../lib/ocrEvidence';
import type { OcrEvidenceItem } from '../lib/recognition/types';

function textResult(text: string): TextRecognitionResult {
  return {
    text,
    blocks: [
      {
        text,
        frame: { left: 1, top: 2, width: 30, height: 8 },
        cornerPoints: undefined,
        recognizedLanguages: [],
        lines: text.split(/\n+/).filter(Boolean).map((line, index) => ({
          text: line,
          frame: { left: 1, top: 2 + index * 10, width: 30, height: 8 },
          cornerPoints: undefined,
          recognizedLanguages: [],
          elements: [],
        })),
      },
    ],
  };
}

const japaneseNumber = parseCollectorNumberEvidence('０９９／１６５', 'collectorNumber');
assert.ok(japaneseNumber);
assert.equal(japaneseNumber.numberValue, 99);
assert.equal(japaneseNumber.denominatorValue, 165);
assert.equal(japaneseNumber.number, '99');
assert.equal(japaneseNumber.denominator, '165');

const koreanPromo = parseCollectorNumberEvidence('ＳＶＰー０９９', 'collectorNumber');
assert.ok(koreanPromo);
assert.equal(koreanPromo.setCode, 'SVP');
assert.equal(koreanPromo.numberValue, 99);
assert.equal(koreanPromo.denominatorValue, null);

const chineseSlash = parseCollectorNumberEvidence('099／190', 'collectorNumber');
assert.ok(chineseSlash);
assert.equal(chineseSlash.numberValue, 99);
assert.equal(chineseSlash.denominatorValue, 190);

const noisyIsolated = parseCollectorNumberEvidence('O99', 'collectorNumber');
assert.ok(noisyIsolated);
assert.equal(noisyIsolated.numberValue, 99);
assert.ok(noisyIsolated.warnings.includes('isolated_collector_number'));
assert.ok(collectorEvidenceConfidenceScore(noisyIsolated) < 0.5);

assert.equal(normaliseCollectorNumberText('０９９ ⁄ １６５'), '099/165');
assert.equal(normaliseOcrEvidenceText(' Pikachu\u3000ex  '), 'Pikachu ex');

assert.deepEqual(selectOcrScriptsForCard({
  probableLanguage: 'en',
  userPreferredLanguages: ['en'],
  visualCandidates: [{ language: 'en' }],
  firstPassText: '099/165',
}), ['latin']);

assert.deepEqual(selectOcrScriptsForCard({
  probableLanguage: 'ja',
  userPreferredLanguages: ['en'],
  visualCandidates: [{ language: 'ja' }],
  firstPassText: '099/165',
}), ['latin', 'japanese']);

assert.deepEqual(selectOcrScriptsForCard({
  probableLanguage: 'ko',
  visualCandidates: [{ language: 'ko' }],
  firstPassText: '099/165',
}), ['latin', 'korean']);

assert.deepEqual(selectOcrScriptsForCard({
  probableLanguage: 'zh-Hant',
  visualCandidates: [{ language: 'zh-Hans' }],
  firstPassText: '099/165',
}), ['latin', 'chinese_traditional']);

const strongCollectorItem: OcrEvidenceItem = {
  rawText: '099/165',
  normalisedText: '099/165',
  sourceRegion: 'collectorNumber',
  boundingBox: null,
  confidence: null,
  probableScript: 'latin',
  recognizerScript: 'latin',
  alternatives: [],
};

assert.equal(shouldReadCardNameRegion({
  firstPassItems: [strongCollectorItem],
  visualCandidates: [{ name: 'Pikachu', language: 'en' }],
  scriptsToAttempt: ['latin'],
}), false);

assert.equal(shouldReadCardNameRegion({
  firstPassItems: [strongCollectorItem],
  visualCandidates: [
    { name: 'Pikachu', language: 'en' },
    { name: 'Raichu', language: 'en' },
  ],
  scriptsToAttempt: ['latin'],
}), true);

async function runAsyncOcrEvidenceTests() {
  const calls: OcrRegionRecognitionRequest[] = [];
  const regions = {
    collectorNumber: { sourceRegion: 'collectorNumber' as const, uri: 'mock://collector' },
    setRarity: { sourceRegion: 'setRarity' as const, uri: 'mock://set' },
    regulationCopyright: { sourceRegion: 'regulationCopyright' as const, uri: 'mock://copyright' },
    cardTitle: { sourceRegion: 'cardTitle' as const, uri: 'mock://title' },
  };
  const evidence = await collectOcrEvidence({
    scanId: 'ocr-unit-ja',
    probableLanguage: 'ja',
    visualCandidates: [
      { name: 'Pikachu', language: 'ja' },
      { name: 'Raichu', language: 'ja' },
    ],
    regions,
    recognizer: async (request) => {
      calls.push(request);
      if (request.sourceRegion === 'collectorNumber') return textResult('099/165');
      if (request.sourceRegion === 'setRarity') return textResult('SV2A');
      if (request.sourceRegion === 'cardTitle' && request.recognizerScript === 'japanese') {
        return textResult('ピカチュウ');
      }
      if (request.sourceRegion === 'cardTitle') return textResult('');
      return textResult('2023 Pokemon');
    },
  });

  assert.equal(evidence.strategyVersion, 'stackr-ocr-evidence-v1.0.0');
  assert.equal(evidence.soleExactMatchAllowed, false);
  assert.equal(evidence.printedNumber?.number, 99);
  assert.equal(evidence.printedNumber?.total, 165);
  assert.ok(evidence.items?.some((item) => item.sourceRegion === 'cardTitle' && item.recognizerScript === 'japanese'));
  assert.ok(!calls.some((call) => call.recognizerScript === 'korean'));
  assert.ok(!calls.some((call) => call.recognizerScript === 'chinese_simplified'));
  assert.ok(!calls.some((call) => call.recognizerScript === 'chinese_traditional'));

  const noNameCalls: OcrRegionRecognitionRequest[] = [];
  await collectOcrEvidence({
    scanId: 'ocr-unit-en',
    probableLanguage: 'en',
    visualCandidates: [{ name: 'Pikachu', language: 'en' }],
    regions,
    recognizer: async (request) => {
      noNameCalls.push(request);
      if (request.sourceRegion === 'collectorNumber') return textResult('099/165');
      if (request.sourceRegion === 'setRarity') return textResult('SV2A');
      return textResult('');
    },
  });
  assert.ok(!noNameCalls.some((call) => call.sourceRegion === 'cardTitle'));

  const ocrOnly = buildCandidateOnlyOcrEvidence({
    printedNumber: { number: 99, total: null, raw: 'O99' },
    rawText: 'O99',
  });
  assert.equal(canOcrEvidenceDriveAutomaticExactMatch(ocrOnly, false), false);
  assert.equal(canOcrEvidenceDriveAutomaticExactMatch(ocrOnly, true), false);
}

runAsyncOcrEvidenceTests()
  .then(() => {
    console.log('ocr evidence tests passed');
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
