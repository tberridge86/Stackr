import assert from 'node:assert/strict';
import { resolveOutputDirectory, summariseSet } from './collect-public-catalogue-coverage';

const set = { setId: 'set-a', languageCode: 'ja', setCode: 'S1', nativeName: 'セット', englishDisplayName: 'Set', total: 2, printedTotal: 1 };
const cards = [
  { cardId: 'card-a', languageCode: 'ja', names: { native: 'カード', englishDisplay: 'Card' }, collectorNumber: { value: '1' }, rarity: { code: 'rare' }, variants: [{ artworkKey: 'tcgdex:ja:S1:1', nativeImageStatus: 'available', image: { url: 'https://assets.example/card' } }] },
  { cardId: 'card-a', languageCode: 'ja', names: { native: 'duplicate', englishDisplay: 'Duplicate' }, collectorNumber: { value: '1' }, rarity: { code: 'rare' }, variants: [] },
  { cardId: 'card-b', languageCode: 'ja', names: {}, collectorNumber: {}, rarity: {}, variants: [{ image: {} }] },
];
const complete = summariseSet(set, cards, null);
assert.equal(complete.actualDistinctCards, 2);
assert.equal(complete.cardGaps?.missingNativeName, 1);
assert.equal(complete.cardGaps?.missingEnglishSupplement, 1);
assert.equal(complete.cardGaps?.missingCollectorNumber, 1);
assert.equal(complete.cardGaps?.missingRarity, 1);
assert.equal(complete.cardGaps?.variantsWithArtworkKey, 1);
assert.equal(complete.cardGaps?.variantsWithDeclaredNativeImageStatus, 1);
assert.equal(complete.cardGaps?.issuedImageUrlDescriptors, 1);
assert.equal(complete.cardGaps?.verifiedNativeImageLoads, null, 'descriptors never become load verification');
assert.equal(complete.setMarks.logoDescriptor, null);
assert.equal(complete.setMarks.state, 'unknown_not_returned_by_sets_api');
const unavailable = summariseSet(set, cards, { status: 504, error: 'Gateway Timeout' });
assert.equal(unavailable.actualDistinctCards, null);
assert.equal(unavailable.cardGaps, null);
assert.equal(unavailable.cardsEndpoint.status, 'unavailable');
assert.throws(() => resolveOutputDirectory('D:/outside-four-language-coverage'), /Output must be a new/);
console.log('Public catalogue coverage collector tests passed.');
