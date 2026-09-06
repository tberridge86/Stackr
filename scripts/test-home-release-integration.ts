import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getHomeCardDisplayMetadata } from '../lib/homeCardDisplayMetadata';
import { getHomeCardDisplayName, getHomeCardSetDisplayName, getHomeActivityDisplayTitle } from '../lib/homeDisplayLabels';

const japanese = {
  id: 'ja-sv2a-043', setId: 'ja-sv2a', number: '043', name: 'ナゾノクサ',
  setName: 'ポケモンカード151', language: 'ja',
  raw: { name: 'ナゾノクサ', english_display_name: 'Oddish', set: { name: 'ポケモンカード151', english_display_name: 'Pokemon Card 151' } },
};
const original = JSON.stringify(japanese);
const display = { ...japanese, ...getHomeCardDisplayMetadata(japanese) };
assert.equal(getHomeCardDisplayName(display), 'Oddish');
assert.equal(getHomeCardSetDisplayName(display), 'Pokemon Card 151');
assert.equal(getHomeActivityDisplayTitle({ title: 'Added ナゾノクサ', cardName: japanese.name, ...display }), 'Added Oddish');
assert.equal(JSON.stringify(japanese), original, 'Display must not mutate source identity');
assert.equal(display.id, japanese.id);
assert.equal(display.language, 'ja');
assert.equal(getHomeCardDisplayName({ name: 'Dracaufeu', ...getHomeCardDisplayMetadata({ id: 'fr-test', name: 'Dracaufeu', language: 'fr' }) }), 'French card');
assert.equal(getHomeCardDisplayName({ name: 'Pikachu', ...getHomeCardDisplayMetadata({ id: 'en-test', name: 'Pikachu', language: 'en' }) }), 'Pikachu');

const hub = readFileSync('features/home/HubScreen.tsx', 'utf8');
const render = hub.slice(hub.indexOf('{/* VALUE TRACKER */}'));
assert.equal((render.match(/<ValueTrackerCard\b/g) ?? []).length, 1);
assert.ok(render.indexOf('<ValueTrackerCard') < render.indexOf('Find your next card'));
assert.ok(render.indexOf('Find your next card') < render.indexOf('<HomeCollectionHero'));
assert.ok(render.indexOf('<HomeCollectionHero') < render.indexOf('<HomeOpportunitiesSection'));
assert.ok(render.slice(render.indexOf('<HomeCollectionHero'), render.indexOf('<HomeOpportunitiesSection')).includes('onRetry={loadCollectionValue}'), 'Binder recovery must reload collection, not unrelated marketplace data');
assert.ok(render.includes('compact'));
for (const retained of [
  'totalValue={collectionTotal}', 'pricingState={collectionPricingSummary.state}',
  'pricingWarning={collectionPricingWarning}', 'onTrendRangeChange={handleChartRangeChange}',
  'onRefresh={refreshLivePrices}', 'refreshing={refreshing}',
  'mintyInsight={chartData.length >= 2 ? mintyInsight : null}',
]) assert.ok(render.includes(retained), `Missing pricing interface: ${retained}`);
for (const retained of ['loadCollectionPrices', 'buildVerifiedHomeSnapshotTrend', 'requestMarketPriceRefresh', 'homeSessionUserIdRef', 'isGate0CommerceActivity']) {
  assert.ok(hub.includes(retained), `Lost release safeguard: ${retained}`);
}
assert.ok(hub.includes("collectionPricingSummary.state === 'fresh'"));
for (const [start, end, reset] of [
  ["console.log('Failed to load home chase cards'", "setChaseError('Could not refresh chase cards.')", 'setChaseCards([])'],
  ["console.log('Failed to load recent home activity'", "setActivityError('Could not refresh recent activity.')", 'setRecentActivity([])'],
]) {
  const failurePath = hub.slice(hub.indexOf(start), hub.indexOf(end));
  assert.ok(failurePath.includes('current !== requestId'), 'Retained data must preserve request/owner guards');
  assert.ok(!failurePath.includes(reset), 'Refresh failure must not clear retained successful rows');
}
const sessionReset = hub.slice(hub.indexOf('const bindHomeSession'), hub.indexOf('const { data: { subscription } }'));
assert.ok(sessionReset.includes('setChaseCards([])') && sessionReset.includes('setRecentActivity([])'), 'Account changes must still clear private rows');
assert.ok(!hub.includes('privatePricingPreview') && !hub.includes('homeCollectorPreview'), 'Native Home must not depend on preview fixtures');
assert.equal(readFileSync('app/(tabs)/index.tsx', 'utf8').trim(), "export { default } from '../../features/home/HubScreen';");
assert.ok(hub.includes('<StackrBackdrop variant="home" />'));
for (const icon of ['stackrIcons.searchCard', 'stackrIcons.scanCard', 'stackrIcons.social']) assert.ok(render.includes(icon));
console.log('Integrated Home ordering, English metadata, native route, original icons and pricing-interface guards passed.');
