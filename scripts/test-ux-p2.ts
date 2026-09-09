import assert from 'node:assert/strict';
import { getSearchFacetScope, isSearchSortSupported } from '../lib/searchFacetScope';
import { DISCOVER_DATE_GROUP, DISCOVER_OTHER_GROUP, groupDiscoverSets, isDiscoverDateGroup } from '../lib/discoverSetGroups';

// Result-type switches must not retain hidden facets that exclude the whole type.
assert.deepEqual(getSearchFacetScope('collectors'), { rarity: false, set: false, language: false, price: false, grading: false });
assert.deepEqual(getSearchFacetScope('sets'), { rarity: false, set: true, language: true, price: false, grading: false });
assert.equal(getSearchFacetScope('raw_card').grading, false);
assert.equal(getSearchFacetScope('graded_slab').rarity, false);
assert.equal(getSearchFacetScope('booster_box').rarity, false);
assert.equal(getSearchFacetScope('booster_box').grading, false);
assert.equal(isSearchSortSupported('collectors', 'priceAsc'), false);
assert.equal(isSearchSortSupported('sets', 'priceDesc'), false);
assert.equal(isSearchSortSupported('raw_card', 'gradeDesc'), false);
assert.equal(isSearchSortSupported('sets', 'newest'), true);

const unknownSets = [
  { id: 'older', language: 'en', releaseDate: '1999/01/01', series: null },
  { id: 'newer', language: 'en', releaseDate: '2025-01-01', series: 'Other' },
  { id: 'undated', language: 'en', releaseDate: 'not a date', series: null },
];
const original = JSON.stringify(unknownSets);
const chronological = groupDiscoverSets(unknownSets);
assert.equal(chronological[0].series, DISCOVER_DATE_GROUP);
assert.deepEqual(chronological[0].sets.map((set) => set.id), ['newer', 'older', 'undated']);
assert.equal(JSON.stringify(unknownSets), original, 'Display grouping must not mutate catalogue identity/data.');
assert.equal(isDiscoverDateGroup(chronological[0].series), true, 'Unclassified sets are immediately visible rather than hidden in Other.');

const known = groupDiscoverSets([
  { id: 'uuid', language: 'en', series: 'Other', externalIds: { setCode: 'sv08.5' } },
  { id: 'swsh12', language: 'en', series: null },
  { id: 'unknown', language: 'en', series: null },
]);
assert.deepEqual(known.map((group) => group.series), ['Scarlet & Violet', 'Sword & Shield', DISCOVER_OTHER_GROUP]);
assert.equal(known.flatMap((group) => group.sets).length, 3);
assert.equal(groupDiscoverSets([{ id: 'sv08.5', language: 'ja' }])[0].series, DISCOVER_DATE_GROUP, 'English code patterns must not invent series for another language.');
assert.deepEqual(groupDiscoverSets([]), []);
console.log('P2 filter scope and chronological catalogue fallback checks passed.');
