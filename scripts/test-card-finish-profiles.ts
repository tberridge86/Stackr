import assert from 'node:assert/strict';
import { CARD_FINISH_PROFILES, getCardFinishMask, getCardFinishMetadata, getLibraryCardFinishMetadata, mergeShowcaseFinishMetadata, resolveCardFinish } from '../lib/cardFinishProfiles';
import { normaliseShowcaseState } from '../lib/profileShowcaseState';

const artwork = { id: 'same-artwork', setId: 'example', rarity: 'Special Illustration Rare' };
const cases: [string, string][] = [
  ['normal', 'non_holo'], ['non-holo', 'non_holo'], ['holofoil', 'holo'],
  ['reverseHolofoil', 'reverse_plain'], ['reverse_holo', 'reverse_plain'],
  ['reverseHoloEnergy', 'reverse_energy'], ['reverse geometric', 'reverse_geometric'],
  ['reverse star holo', 'reverse_stars'], ['reverse cosmos holo', 'reverse_cosmos'],
  ['reverseHoloPokeball', 'reverse_pokeball'], ['pokeball_holo', 'reverse_pokeball'],
  ['masterBallPatternHolofoil', 'reverse_masterball'], ['masterball_holo', 'reverse_masterball'],
  ['cosmos holo', 'vintage_cosmos'], ['star holo', 'vintage_stars'],
  ['lineHolofoil', 'line_holo'], ['speckledHolofoil', 'confetti'],
  ['cracked ice', 'cracked_ice'], ['radiant', 'radiant'], ['glitter', 'glitter'],
];
for (const [variant, expected] of cases) {
  const result = resolveCardFinish({ ...artwork, variant });
  assert.equal(result.profile.id, expected, variant);
  assert.equal(result.source, 'explicit');
}
assert.equal(resolveCardFinish({ variant: 'normal', finish: 'gold', rarity: 'SAR', isHolographic: true }).profile.id, 'non_holo');
assert.equal(resolveCardFinish({ variant: 'first_edition', finish: 'holofoil' }).profile.id, 'holo');
assert.equal(resolveCardFinish({ variant: 'unlimited', rarity: 'Rare Holo' }).profile.id, 'holo');
assert.equal(resolveCardFinish({ finish: 'textured full art', rarity: 'Common' }).profile.texture, 'etched');
for (const [rarity, expected] of [
  ['AR', 'art_rare'], ['Illustration Rare', 'art_rare'], ['SAR', 'special_art'], ['Special Illustration Rare', 'special_art'],
  ['Shiny Rare', 'baby_shiny'], ['Rare Shiny', 'baby_shiny'], ['Shiny Rare VMAX', 'full_art_shiny'],
  ['Shiny Full Art', 'full_art_shiny'], ['Rare Shiny GX', 'full_art_shiny'], ['Rare Rainbow', 'rainbow'], ['Hyper Rare', 'gold'],
] as const) assert.equal(resolveCardFinish({ rarity }).profile.id, expected, rarity);
assert.equal(resolveCardFinish({ rarity: 'Art Rare' }).profile.texture, 'none');
assert.equal(resolveCardFinish({ rarity: 'Shiny Rare' }).profile.coverage, 'artwork');
assert.equal(resolveCardFinish({ rarity: 'Shiny Rare VMAX' }).profile.coverage, 'full');

// Region and language cannot invent a finish; missing/unsupported data remains diagnosable.
for (const language of ['zh-cn', 'zh-tw', 'ja', 'en']) {
  assert.equal(resolveCardFinish({ language }).profile.id, 'non_holo');
  assert.equal(resolveCardFinish({ language, variant: 'reverseHoloEnergy' }).profile.id, 'reverse_energy');
}
const unknown = resolveCardFinish({ language: 'zh-cn', finish: 'mystery special' });
assert.equal(unknown.source, 'fallback');
assert.ok(unknown.diagnostics.length >= 2);
assert.ok(resolveCardFinish({ variant: 'reverseHolofoil' }).diagnostics.some((message) => message.includes('layout')));
assert.equal(resolveCardFinish({ variant: 'stamped' }).stamped, true);
assert.equal(resolveCardFinish({ variant: 'stamped' }).profile.id, 'non_holo');
assert.equal(resolveCardFinish({ variant: 'stampedHolofoil' }).profile.id, 'holo');

const availability = getCardFinishMetadata({ id: 'base', raw_data: { variants: { holo: true, reverse: true }, tcgplayer: { prices: { holofoil: {} } } } });
assert.equal(availability.variant, null);
assert.equal(availability.finish, null);
assert.equal(resolveCardFinish(availability).profile.id, 'non_holo');
assert.equal(getCardFinishMetadata({ variant: 'normal', raw_data: { variant: 'masterball_holo' } }).variant, 'normal');

// Library tiles use the actual owned finish, independently of price availability or condition.
const libraryCard = { rarity: 'Rare Holo', condition: 'Near Mint', raw_data: { tcgplayer: { prices: { normal: {}, holofoil: {}, reverseHolofoil: {} } } } };
assert.equal(resolveCardFinish(getLibraryCardFinishMetadata(libraryCard, ['masterBallPatternHolofoil'])).profile.id, 'reverse_masterball');
assert.equal(resolveCardFinish(getLibraryCardFinishMetadata(libraryCard, ['normal'])).profile.id, 'non_holo');
assert.equal(resolveCardFinish(getLibraryCardFinishMetadata(libraryCard, ['reverseHolofoil', 'reverseHolofoil'])).profile.id, 'reverse_plain');
assert.equal(getLibraryCardFinishMetadata(libraryCard, ['normal', 'reverseHolofoil']).variant, null);
assert.equal(getLibraryCardFinishMetadata(libraryCard, ['normal', 'unknown special']).variant, null);
assert.equal(resolveCardFinish(getLibraryCardFinishMetadata(libraryCard, ['normal', 'reverseHolofoil'])).profile.id, 'holo');
assert.equal(getLibraryCardFinishMetadata({ condition: 'Near Mint' }).variant, null);

// JSON/local-storage roundtrip must preserve the selected physical variant and slab flag.
const saved = { ...artwork, name: 'Same artwork', variant: 'masterBallPatternHolofoil', finish: 'reverse holo', language: 'zh-cn', layout: 'modern', showcaseKind: 'graded', updatedAt: '2026-10-05T12:00:00Z' };
const roundtrip = normaliseShowcaseState(JSON.parse(JSON.stringify({ favorite: saved })));
assert.equal(roundtrip.favorite?.variant, saved.variant);
assert.equal(roundtrip.favorite?.finish, saved.finish);
assert.equal(roundtrip.favorite?.language, 'zh-cn');
assert.equal(roundtrip.favorite?.showcaseKind, 'graded');
assert.equal(roundtrip.favorite?.layout, 'modern');
const fresh = { id: artwork.id, set: { id: artwork.setId }, rarity: 'Common' };
assert.equal(resolveCardFinish(mergeShowcaseFinishMetadata(fresh, roundtrip.favorite)).profile.id, 'reverse_masterball');
assert.equal(mergeShowcaseFinishMetadata({ ...fresh, rarity: undefined }, saved).rarity, artwork.rarity);
assert.equal(mergeShowcaseFinishMetadata({ ...fresh, id: 'another-card' }, saved).variant, null);
assert.equal(mergeShowcaseFinishMetadata({ ...fresh, set: { id: 'another-set' } }, saved).variant, null);
assert.equal(normaliseShowcaseState({ grail: { id: 'old', name: 'Legacy showcase' } }).grail?.variant, null);
assert.deepEqual(normaliseShowcaseState({ favorite: null, invalid: saved }), {});

// Only explicit, reviewed, matching rules can install a set/language-specific treatment.
const rules = [{ setId: 'test-only', variant: 'special', language: 'zh-cn', profile: 'reverse_energy' as const, layout: 'modern' as const, reference: 'test fixture' }];
assert.equal(resolveCardFinish({ setId: 'test-only', variant: 'special', language: 'zh-cn' }, rules).source, 'override');
assert.equal(resolveCardFinish({ setId: 'test-only', variant: 'special', language: 'zh-tw' }, rules).source, 'fallback');
assert.equal(resolveCardFinish({ setId: 'other', variant: 'special', language: 'zh-cn' }, rules).source, 'fallback');
assert.equal(resolveCardFinish({ setId: 'test-only', variant: 'special', language: 'zh-cn' }, [{ ...rules[0], reference: '' }]).source, 'fallback');

assert.notEqual(getCardFinishMask('artwork', 'classic'), getCardFinishMask('body', 'classic'));
assert.notEqual(getCardFinishMask('artwork', 'classic'), getCardFinishMask('artwork', 'unknown'));
for (const profile of Object.values(CARD_FINISH_PROFILES)) assert.ok(profile.intensity > 0 && profile.intensity <= 1);
console.log('Card finish tests passed: variant precedence, finish families, library ownership, conservative fallbacks, reviewed overrides and showcase roundtrip/hydration.');
