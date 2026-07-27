import {
  extractLocalOcrSignals,
  hasIndependentLocalOcrConfirmationEvidence,
  parseLocalOcrPrintedNumber,
  rankLocalOcrCandidates,
  scoreLocalOcrCandidate,
  type LocalOcrRegionText,
} from '../lib/localOcrCardMatcher';
import type { LocalScanCard } from '../lib/localCardIndex';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function makeCard(overrides: Partial<LocalScanCard>): LocalScanCard {
  return {
    id: 'card-1',
    name: 'Mew',
    language: 'en',
    number: '160',
    number_denominator: 159,
    set_id: 'swsh12pt5',
    set_name: 'Crown Zenith',
    set_code: 'CRZ',
    set_printed_total: 159,
    release_year: 2023,
    release_date: '2023/01/20',
    image_small: 'https://example.com/mew.jpg',
    image_hash: null,
    rarity: 'Rare Secret',
    variant: 'Rare Secret',
    ...overrides,
  };
}

function testEnglishNumberAndSetScoring() {
  const regions: LocalOcrRegionText[] = [
    { role: 'name', text: 'Mew' },
    { role: 'collector-number', text: '160/159' },
    { role: 'set-code', text: 'CRZ' },
    { role: 'copyright', text: '2023 Pokemon' },
  ];
  const signals = extractLocalOcrSignals(regions);
  const candidate = scoreLocalOcrCandidate(makeCard({}), signals);

  assert(signals.language === 'en', 'Expected English language signal');
  assert(signals.printedNumber?.number === 160, 'Expected printed number 160');
  assert(signals.printedNumber?.denominator === 159, 'Expected denominator 159');
  assert(candidate.confidence >= 0.84, `Expected strong confidence, got ${candidate.confidence}`);
  assert(candidate.reasons.includes('number-total'), 'Expected number-total reason');
  assert(candidate.reasons.includes('set-code'), 'Expected set-code reason');
}

function testJapaneseFullWidthNumberNormalisation() {
  const parsed = parseLocalOcrPrintedNumber('１６０／１５９');
  assert(parsed?.number === 160, 'Expected full-width number to normalise');
  assert(parsed?.denominator === 159, 'Expected full-width denominator to normalise');

  const regions: LocalOcrRegionText[] = [
    { role: 'name', text: 'ミュウ' },
    { role: 'collector-number', text: '１６０／１５９' },
  ];
  const signals = extractLocalOcrSignals(regions);
  assert(signals.language === 'ja', 'Expected Japanese language signal');
}

function testAmbiguousVariantIsNotStrong() {
  const regions: LocalOcrRegionText[] = [
    { role: 'name', text: 'Charizard ex' },
    { role: 'collector-number', text: '199/165' },
    { role: 'set-code', text: 'MEW' },
  ];
  const signals = extractLocalOcrSignals(regions);
  const ranked = rankLocalOcrCandidates([
    makeCard({
      id: 'charizard-1',
      name: 'Charizard ex',
      number: '199',
      set_id: 'sv3pt5',
      set_name: '151',
      set_code: 'MEW',
      set_printed_total: 165,
      number_denominator: 165,
      rarity: 'Special Illustration Rare',
      variant: 'Special Illustration Rare',
    }),
    makeCard({
      id: 'charizard-2',
      name: 'Charizard ex',
      number: '199',
      set_id: 'sv3pt5',
      set_name: '151',
      set_code: 'MEW',
      set_printed_total: 165,
      number_denominator: 165,
      rarity: 'Promo',
      variant: 'Promo',
    }),
  ], signals);

  assert(ranked.length === 2, 'Expected two ranked candidates');
  assert(ranked[0].ambiguousVariant, 'Expected top candidate to be marked ambiguous');
}

function testOcrOnlyEvidenceCannotAutoConfirm() {
  const regions: LocalOcrRegionText[] = [
    { role: 'collector-number', text: '099/165' },
  ];
  const signals = extractLocalOcrSignals(regions);
  const candidate = scoreLocalOcrCandidate(makeCard({
    id: 'number-only',
    name: 'Unknown Example',
    number: '099',
    set_printed_total: 165,
    number_denominator: 165,
  }), signals);

  assert(candidate.reasons.includes('number-total'), 'Expected number-total OCR evidence');
  assert(
    !hasIndependentLocalOcrConfirmationEvidence(candidate),
    'Expected number-only OCR evidence to lack independent confirmation'
  );

  const visualCandidate = scoreLocalOcrCandidate(makeCard({
    id: 'visual-corroborated',
    name: 'Unknown Example',
    number: '099',
    set_printed_total: 165,
    number_denominator: 165,
  }), signals, 0.74);
  assert(
    hasIndependentLocalOcrConfirmationEvidence(visualCandidate),
    'Expected artwork rerank evidence to be independent confirmation'
  );
}

testEnglishNumberAndSetScoring();
testJapaneseFullWidthNumberNormalisation();
testAmbiguousVariantIsNotStrong();
testOcrOnlyEvidenceCannotAutoConfirm();

console.log('local OCR card matcher tests passed');
