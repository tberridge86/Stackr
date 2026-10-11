import assert from 'node:assert/strict';
import fs from 'node:fs';

const tab = fs.readFileSync('components/haptic-tab.tsx','utf8');
const listing = fs.readFileSync('features/listing/CreateListingScreen.tsx','utf8');
const haptics = fs.readFileSync('lib/haptics.ts','utf8');

assert.match(tab,/stackrHaptics\.selection\(\)/,'tab feedback must use the shared semantic haptic facade');
assert.doesNotMatch(tab,/preferenceAwareHaptics|ImpactFeedbackStyle/,'tab code must not choose native haptic strength locally');

assert.doesNotMatch(listing,/preferenceAwareHaptics|\bHaptics\./,'listing flow must not bypass the semantic Stackr facade');
assert.match(listing,/stackrHaptics\.selection\(\)/,'listing choices keep embedded selection feedback');
assert.match(listing,/stackrHaptics\.captureSaved\(\)/,'successful photo capture uses semantic capture feedback');
assert.match(listing,/stackrHaptics\.analysisCompleted\(\)/,'completed analysis has one semantic completion cue');
assert.match(listing,/stackrHaptics\.listingCompleted\(\)/,'publishing a listing uses listing completion feedback');

assert.match(haptics,/\| 'analysis_completed'/);
assert.match(haptics,/analysisCompleted: \(\) => haptic\('analysis_completed'\)/);
assert.match(haptics,/Legacy screens keep their existing effect/,'legacy compatibility wrapper remains explicit until all callers are migrated');

console.log('Streamlined haptics passed: active tab/listing interactions use one preference-aware semantic facade.');
