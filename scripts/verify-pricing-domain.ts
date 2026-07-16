import {
  buildPokeTraceGradedTier,
  buildStackrPricingKey,
  normalizePokeTraceCardPrice,
} from '../lib/pricing';
import { formatGraderShortName, getGraderGradeLabel, normalizeGraderKey } from '../lib/graderRegistry';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const fakeCard = {
  id: 'card-1',
  name: 'Pikachu',
  number: '025',
  set: { name: 'Test Set' },
  market: 'US',
  currency: 'GBP',
  prices: {
    ebay: {
      PSA_10: { avg: 220, low: 205, high: 238, count: 8 },
      CGC_10: { avg: 178, low: 165, high: 190, count: 4 },
      BGS_9_5: { avg: 165, low: 150, high: 180, count: 3 },
    },
  },
  gradedOptions: ['PSA_10', 'CGC_10', 'BGS_9_5'],
};

assert(normalizeGraderKey('CGS') === 'CGC', 'Legacy CGS alias should normalise to CGC');
assert(formatGraderShortName('Ace Grading') === 'ACE', 'ACE should use approved short display label');
assert(getGraderGradeLabel('CGC', '10', 'Pristine') === 'PRISTINE', 'Explicit CGC Pristine label should be preserved');

assert(buildPokeTraceGradedTier('PSA', '10') === 'PSA_10', 'PSA 10 tier should be PSA_10');
assert(buildPokeTraceGradedTier('CGC', '10') === 'CGC_10', 'CGC 10 tier should be CGC_10');
assert(buildPokeTraceGradedTier('BGS', '9.5') === 'BGS_9_5', 'BGS 9.5 tier should be BGS_9_5');
assert(buildPokeTraceGradedTier('PSA', '10') !== buildPokeTraceGradedTier('CGC', '10'), 'PSA 10 and CGC 10 must not share a pricing key');

const psa = normalizePokeTraceCardPrice(fakeCard, { gradingCompany: 'PSA', grade: '10' });
const cgc = normalizePokeTraceCardPrice(fakeCard, { gradingCompany: 'CGC', grade: '10' });
const ace = normalizePokeTraceCardPrice(fakeCard, { gradingCompany: 'ACE', grade: '10' });

assert(psa?.graded_average === 220, 'PSA 10 should resolve the PSA-specific tier');
assert(cgc?.graded_average === 178, 'CGC 10 should resolve the CGC-specific tier');
assert(ace?.graded_average == null, 'ACE 10 should not inherit another grader price');

const englishKey = buildStackrPricingKey({
  canonicalCardId: 'card-1',
  language: 'en',
  rawOrGraded: 'graded',
  grader: 'PSA',
  grade: '10',
  currency: 'GBP',
  source: 'poketrace',
  salesWindow: '30d',
});
const japaneseKey = buildStackrPricingKey({
  canonicalCardId: 'card-1',
  language: 'ja',
  rawOrGraded: 'graded',
  grader: 'PSA',
  grade: '10',
  currency: 'GBP',
  source: 'poketrace',
  salesWindow: '30d',
});

assert(englishKey !== japaneseKey, 'English and Japanese price keys must stay separate');

console.log('Pricing domain checks passed');
