import assert from 'node:assert/strict';
import { formatEvidenceStatus, formatMarketEvidence } from '../lib/marketEvidence';

assert.equal(formatMarketEvidence({ count: 12, soldCount: 0, primarySource: 'tcgplayer' }),
  'Based on 12 market observations · Primary source: tcgplayer');
assert.equal(formatMarketEvidence({ count: 12, soldCount: 3, primarySource: 'ebay' }),
  'Based on 12 market observations · 3 sold · Primary source: ebay');
assert.equal(formatMarketEvidence({ count: 1 }), 'Based on 1 market observation');
assert.equal(formatMarketEvidence({ count: 0, soldCount: 0 }), null);
assert.equal(formatMarketEvidence(null), null);
assert.equal(formatEvidenceStatus('market_estimate'), 'market estimate');
assert.equal(formatEvidenceStatus('sold_comps'), 'sold comps');
assert.equal(formatEvidenceStatus('thin'), 'thin');
assert.equal(formatEvidenceStatus('unavailable'), 'unavailable');
assert.equal(formatEvidenceStatus(undefined), 'market estimate');
console.log('Market evidence: mixed observations remain distinct from sold counts; provider and unavailable/thin status preserved.');
