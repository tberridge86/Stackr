import assert from 'node:assert/strict';
import { getCardArtworkImageCandidates } from '../lib/cardArtworkImages';
import { selectStackrImageSourceCandidate } from '../lib/stackrImageSourceState';

const thumbnail = 'https://example.test/card-small.webp';
const full = 'https://example.test/card-large.png?signature=original';
const exactEdition = 'https://example.test/edition-large.png';
const input = { uri: thumbnail, fullUri: full, rawData: { images: { small: thumbnail, large: full } } };
assert.deepEqual(getCardArtworkImageCandidates(input), [full, thumbnail]);
assert.deepEqual(getCardArtworkImageCandidates({ ...input, size: 'small' }), [thumbnail, full]);
assert.deepEqual(getCardArtworkImageCandidates({ ...input, editionUris: [exactEdition, null, exactEdition] }), [exactEdition, full, thumbnail]);
assert.deepEqual(getCardArtworkImageCandidates({ uri: thumbnail, rawData: { raw_data: { image_large: full } } }), [full, thumbnail]);
assert.deepEqual(getCardArtworkImageCandidates({ uri: thumbnail }), [thumbnail]);
assert.deepEqual(getCardArtworkImageCandidates({ rawData: { image_large: false, images: { large: ' ' } } }), []);

const candidates = getCardArtworkImageCandidates(input);
assert.equal(selectStackrImageSourceCandidate(candidates, 0), full);
assert.equal(selectStackrImageSourceCandidate(candidates, 1), thumbnail);
assert.equal(selectStackrImageSourceCandidate(candidates, 2), null);
assert.ok(candidates.includes(full), 'Signed source URL must be preserved verbatim; no guessed high-res URL or resizing endpoint.');
console.log('Card artwork tests passed: full-resolution preference, thumbnail efficiency, exact editions, nested snapshots, signed URLs and failure recovery.');
