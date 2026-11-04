import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

const commonPhrases = [
  'The CoroCoro library', 'Catalogue match pending', 'Test touch feedback',
  'stackr-premium-opening', 'stackr-premium-poster',
  'Estimated price (provisional baseline)',
  'catalogue-rarity-era-baseline-v2', 'retired_provisional_baseline',
  'Verified sale prices exclude delivery.', 'unsupported_graded_history_identity',
  'Loading more...', 'Results will appear as loading completes.',
  'Your card is saved. Its history entry',
];
const corePhrases = [
  'COLLECTION VALUE', 'Copies with a stored price', 'Browse every release',
  'Start a binder for the cards you collect.', 'View saved binders', 'core-preview',
  'The saved binders did not match your account. Please retry.',
  'Your sign-in changed. Please retry.',
  'The collection account changed. Please retry.',
  'Try a different name, number, or region.',
];

/** Check the actual reviewed Home entry, without a release-time bypass flag. */
export function verifyRecoveryUiContent(code, { homeEntrySource, coreCollectionMode }) {
  assert.ok(Buffer.isBuffer(code), 'Read the actual exported iOS bundle bytes.');
  assert.equal(typeof coreCollectionMode, 'boolean', 'Use the reviewed capability policy.');
  const entry = /^\s*export\s*\{\s*default\s*\}\s*from\s*['"]\.\.\/\.\.\/features\/home\/(CoreHomeScreen|HubScreen)['"];?\s*$/u.exec(homeEntrySource);
  assert.ok(entry, 'The reviewed Home entry must explicitly export a supported Home screen.');
  const homeSurface = entry[1];
  assert.equal(homeSurface, coreCollectionMode ? 'CoreHomeScreen' : 'HubScreen',
    'The reviewed Home entry and capability policy must agree.');
  const phrases = [...commonPhrases, ...(coreCollectionMode ? corePhrases : ['activity_read_identity_changed'])];
  for (const phrase of phrases) {
    assert.ok(code.includes(Buffer.from(phrase)), `Recovery UI content is absent from the exported iOS code: ${phrase}`);
  }
  return { homeSurface, verifiedPhrases: phrases.length };
}
