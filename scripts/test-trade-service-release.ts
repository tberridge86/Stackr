import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TRADE_SERVICE_SELECTION_ENABLED,
  TRADE_SERVICE_TERMS_VERSION,
  TRADE_SERVICE_LEVELS,
  getTradeServiceDefinition,
  getTradeServiceTrackingRequiredSides,
  isTradeServiceLevel,
  isTradeServiceSchemaMissingError,
} from '../lib/tradeService';
import { TRADE_SERVICE_PREVIEW_FIXTURES, TRADE_SERVICE_PREVIEW_FIXTURE_NOTICE } from './fixtures/tradeServicePreviewFixtures';

assert.equal(TRADE_SERVICE_SELECTION_ENABLED, false, 'This packet must not activate a live selector');
assert.deepEqual(TRADE_SERVICE_LEVELS, ['direct', 'tracked']);
assert.equal(TRADE_SERVICE_TERMS_VERSION, 'direct-tracked-v1');
for (const level of TRADE_SERVICE_LEVELS) {
  assert.equal(isTradeServiceLevel(level), true);
  const terms = getTradeServiceDefinition(level);
  assert.equal(terms.level, level);
  assert.match(terms.termsDescription, /does not/);
  assert.match(terms.termsDescription, /authenticate cards/);
}
for (const invalid of ['Tracked', 'insured', 'ags', null, {}, '__proto__']) assert.equal(isTradeServiceLevel(invalid), false);
assert.deepEqual(getTradeServiceTrackingRequiredSides({ serviceLevel: 'direct', senderCardCount: 2, receiverCardCount: 3 }), []);
assert.deepEqual(getTradeServiceTrackingRequiredSides({ serviceLevel: 'tracked', senderCardCount: 2, receiverCardCount: 3 }), ['sender', 'receiver']);
assert.deepEqual(getTradeServiceTrackingRequiredSides({ serviceLevel: 'tracked', senderCardCount: 0, receiverCardCount: 3 }), ['receiver']);
assert.deepEqual(getTradeServiceTrackingRequiredSides({ serviceLevel: 'tracked', senderCardCount: 2, receiverCardCount: 0 }), ['sender']);
assert.deepEqual(getTradeServiceTrackingRequiredSides({ serviceLevel: 'tracked', senderCardCount: 0, receiverCardCount: 0 }), []);
assert.equal(isTradeServiceSchemaMissingError({ code: '42703', message: 'service_level column does not exist' }), true);
assert.equal(isTradeServiceSchemaMissingError({ code: 'PGRST204', message: 'service_terms_version missing from schema cache' }), true);
assert.equal(isTradeServiceSchemaMissingError({ code: '42501', message: 'permission denied for trade_offers' }), false);
assert.equal(isTradeServiceSchemaMissingError({ code: '42703', message: 'unrelated column does not exist' }), false);
assert.equal(TRADE_SERVICE_PREVIEW_FIXTURES.length, 8);
assert.match(TRADE_SERVICE_PREVIEW_FIXTURE_NOTICE, /not a real trade/);
assert.equal(new Set(TRADE_SERVICE_PREVIEW_FIXTURES.map(({ id }) => id)).size, 8);
for (const fixture of TRADE_SERVICE_PREVIEW_FIXTURES) {
  assert.match(fixture.id, /^fixture-trade-service-/);
  for (const tracking of fixture.tracking) {
    assert.equal(tracking.carrier, 'Preview carrier');
    assert.match(tracking.reference!, /^PREVIEW-TRACK-\d+$/);
  }
}
// Prospective tracking rules do not become native UI or a transaction API.
for (const file of ['app/offer/new.tsx', 'app/offer/index.tsx', 'lib/tradeOffers.ts']) {
  const source = readFileSync(file, 'utf8');
  assert.ok(!source.includes('tradeServicePreviewFixtures'));
  assert.ok(!source.includes("from '../../lib/tradeService'"));
  assert.ok(!source.includes('service_level'), 'No new persisted service fields without a verified migration');
}
console.log('Direct/Tracked planning rules and eight synthetic fixtures passed; live selection and fulfilment remain held.');
