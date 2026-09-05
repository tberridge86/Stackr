import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { buildJapaneseSetDisplayDraftLookup, normalizeJapaneseSetDisplayDraftCode } from './build-japanese-set-display-draft-lookup';
import { JAPANESE_SET_DISPLAY_DRAFT_LOOKUP_METADATA as clientMetadata, JAPANESE_SET_DISPLAY_DRAFTS_BY_CODE as clientLookup } from '../lib/generated/japaneseSetDisplayDrafts.generated';
import { JAPANESE_SET_DISPLAY_DRAFT_LOOKUP_METADATA as backendMetadata, JAPANESE_SET_DISPLAY_DRAFTS_BY_CODE as backendLookup } from '../backend/lib/generated/japaneseSetDisplayDrafts.generated.mjs';

assert.deepEqual(backendMetadata, clientMetadata);
assert.deepEqual(backendLookup, clientLookup);
assert.equal(clientMetadata.count, 11);
assert.equal(clientMetadata.displayLabel, 'English translation:');
assert.equal(clientMetadata.status, 'model_translation_draft');
assert.equal(clientMetadata.englishDisplayNameAuthoritative, false);
assert.equal(clientMetadata.englishTextStatus, 'stackr_non_authoritative_editorial_translation_candidate');
assert.equal(clientMetadata.policy.nativeNameRemainsPrimary, true);
assert.equal(clientMetadata.policy.canonicalDatabaseWriteAuthorized, false);
assert.equal(clientMetadata.policy.artworkAuthorized, false);
assert.equal(clientMetadata.policy.activationAuthorized, false);
assert.equal(clientMetadata.policy.publicRuntimeImportAuthorized, false);
assert.equal(clientMetadata.policy.removedRedOfficialPageRecordCount, 26);
assert.equal(normalizeJapaneseSetDisplayDraftCode('XY11-Bb+'), 'xy11bbp');
assert.equal('xy8bb' in clientLookup, false);
assert.equal('bw1bb' in clientLookup, false);
assert.equal('xy11bb' in clientLookup, false);
assert.equal(clientLookup.pcg1.englishTranslation, 'Flight of Legends');
assert.equal(clientLookup.pcg1.sourceKind, 'pinned_tcgdex_native_title');
assert.equal(clientLookup.pcg1.sourceSha256, '3573099ff83929a1da1dd1e7fad056e9e4cee52933cd8c0f540b33f860e5ae0d');
assert.equal(clientLookup.m6.englishTranslation, 'Storm Emeralda');
assert.equal('sourcePath' in clientLookup.m6, false);
for (const entry of Object.values(clientLookup)) {
  assert.equal(/\s/u.test(entry.normalizedNativeName), false, 'Native matching removes Japanese full-width and ASCII whitespace');
}

const root = mkdtempSync(resolve(tmpdir(), 'stackr-ja-display-drafts-'));
try {
  const sourcePath = resolve(root, 'source.json');
  const clientOutput = resolve(root, 'client.ts');
  const backendOutput = resolve(root, 'backend.mjs');
  const source = JSON.parse(readFileSync('catalogue/japanese-set-display-drafts-source.json', 'utf8'));
  source.entries[1] = { ...source.entries[0] };
  writeFileSync(sourcePath, JSON.stringify(source), 'utf8');
  assert.throws(() => buildJapaneseSetDisplayDraftLookup({ sourcePath, clientOutput, backendOutput }), /Duplicate normalized Japanese set code/);
  const pinnedSource = JSON.parse(readFileSync('catalogue/japanese-set-display-drafts-source.json', 'utf8'));
  pinnedSource.entries.find((entry: { setCode: string }) => entry.setCode === 'PCG1').sourceSha256 = '0'.repeat(64);
  writeFileSync(sourcePath, JSON.stringify(pinnedSource), 'utf8');
  assert.throws(() => buildJapaneseSetDisplayDraftLookup({ sourcePath, clientOutput, backendOutput }), /Invalid pinned TCGdex source/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('Japanese set display draft lookup passed');
