import assert from 'node:assert/strict';
import { nextStackrImageCandidate, stackrImageCandidates } from '../lib/stackrImageCandidates';

const thumbnail = { uri: 'https://images.example/card-thumb.webp' };
const original = { uri: 'https://images.example/card.webp' };
const full = { uri: 'https://images.example/card-large.webp' };
const candidates = stackrImageCandidates([null, thumbnail, thumbnail, original, full, 42]);
assert.equal(candidates.length, 4, 'Repeated rendition URLs must not cause repeated failures.');
const failed: string[] = [];
for (const expected of [thumbnail, original, full, 42]) {
  const selected = nextStackrImageCandidate(candidates, failed);
  assert.deepEqual(selected?.source, expected, 'Try every supplied rendition before the bundled fallback.');
  failed.push(selected!.key);
}
assert.equal(nextStackrImageCandidate(candidates, failed), null, 'Exhausted sources must stop retrying.');
assert.equal(nextStackrImageCandidate(stackrImageCandidates([72, thumbnail]), [])?.source, 72,
  'Owner-selected bundled cover artwork keeps priority over remote images.');
assert.deepEqual(nextStackrImageCandidate(stackrImageCandidates([thumbnail, original]), [JSON.stringify(thumbnail)])?.source,
  original, 'New object instances must not restart a failed thumbnail.');
assert.equal(nextStackrImageCandidate(stackrImageCandidates([]), []), null);
assert.equal(stackrImageCandidates([[thumbnail, original], original]).length, 2);
console.log('Image rendition fallback, deduplication, cover priority and exhaustion passed.');
