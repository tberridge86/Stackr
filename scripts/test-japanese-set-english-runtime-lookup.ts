import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getEnglishSetDisplayName as getClientEnglishSetDisplayName,
  getEnglishSetDisplaySupplement as getClientEnglishSetDisplaySupplement,
  getPreferredSetDisplayName,
} from '../lib/pokemonDisplayNames';
import {
  TCGDEX_JAPANESE_SET_ENGLISH_LOOKUP_METADATA as clientMetadata,
  TCGDEX_JAPANESE_SET_ENGLISH_NAMES as clientLookup,
} from '../lib/generated/tcgdexJapaneseSetEnglishNames.generated';
import {
  getEnglishSetDisplayName as getBackendEnglishSetDisplayName,
  getEnglishSetDisplaySupplement as getBackendEnglishSetDisplaySupplement,
} from '../backend/lib/cardDisplayNames.js';
import {
  TCGDEX_JAPANESE_SET_ENGLISH_LOOKUP_METADATA as backendMetadata,
  TCGDEX_JAPANESE_SET_ENGLISH_NAMES as backendLookup,
} from '../backend/lib/generated/tcgdexJapaneseSetEnglishNames.generated.mjs';
import {
  STACKR_JAPANESE_SET_IDENTITIES_BY_CODE as clientIdentities,
  STACKR_JAPANESE_SET_IDENTITY_LOOKUP_METADATA as clientIdentityMetadata,
} from '../lib/generated/stackrJapaneseSetIdentity.generated';
import {
  STACKR_JAPANESE_SET_IDENTITIES_BY_CODE as backendIdentities,
  STACKR_JAPANESE_SET_IDENTITY_LOOKUP_METADATA as backendIdentityMetadata,
} from '../backend/lib/generated/stackrJapaneseSetIdentity.generated.mjs';

assert.deepEqual(backendMetadata, clientMetadata);
assert.deepEqual(backendLookup, clientLookup);
assert.deepEqual(backendIdentityMetadata, clientIdentityMetadata);
assert.deepEqual(backendIdentities, clientIdentities);
assert.equal(clientMetadata.count, 256);
assert.equal(clientMetadata.language, 'ja');
assert.equal(clientMetadata.sourceSha256, '92639734fb2bb7167c96d720a651c66ccf618d160bd9169e04dc6ba0a77280f9');
assert.equal(clientMetadata.upstream.pinnedCommit, 'dd4fc9460b54b91c25df750c68ca36b9946448e2');
assert.equal(clientMetadata.upstream.sha256, '8420715261c1a3b2237c822294e7ea3fe8e544ad970c8c0d60612752967957f5');
assert.equal(clientMetadata.upstream.licence, 'MIT');
assert.equal(clientMetadata.policy.nativeNameRemainsPrimary, true);
assert.equal(clientMetadata.policy.existingReviewedRuntimeMapWins, true);
assert.equal(clientMetadata.policy.canonicalDatabaseWriteAuthorized, false);
assert.equal(clientMetadata.rightsGate.classification, 'green');
assert.equal(clientMetadata.rightsGate.activationAuthorized, true);
assert.equal(clientMetadata.rightsGate.publicRuntimeImportAuthorized, true);
assert.equal(clientMetadata.rightsGate.canonicalDatabaseWriteAuthorized, false);
assert.equal(clientIdentityMetadata.language, 'ja');
assert.equal(clientIdentityMetadata.count, 215);
assert.equal(clientIdentityMetadata.excluded, 41);
assert.equal(clientIdentityMetadata.policy.canonicalDatabaseWriteAuthorized, false);
assert.equal(
  clientIdentityMetadata.reviewedTcgdexEnglishSource.sha256,
  '92639734fb2bb7167c96d720a651c66ccf618d160bd9169e04dc6ba0a77280f9',
);
const identitySource = JSON.parse(readFileSync('catalogue/stackr-japanese-set-identity-source.2026-09-04.json', 'utf8')) as {
  entries: Array<{ normalizedSetCode: string }>;
  exclusions: Array<{ normalizedSetCode: string; reason: string }>;
};
const boundCodes = new Set(identitySource.entries.map((entry) => entry.normalizedSetCode));
const excludedCodes = new Set(identitySource.exclusions.map((entry) => entry.normalizedSetCode));
assert.equal(boundCodes.size, identitySource.entries.length);
assert.equal(excludedCodes.size, identitySource.exclusions.length);
assert.equal(boundCodes.size + excludedCodes.size, clientMetadata.count);
for (const code of boundCodes) assert.equal(excludedCodes.has(code), false, `${code} cannot be both bound and excluded`);
for (const code of ['smp', 'xyp', 'sm3p', 'sm4p']) {
  assert.equal(boundCodes.has(code), false, `${code} must fail closed because its first-party identity is ambiguous`);
  assert.equal(
    identitySource.exclusions.find((entry) => entry.normalizedSetCode === code)?.reason,
    'ambiguous_first_party_identity',
  );
}
const rightsReview = JSON.parse(readFileSync('catalogue/rights-reviews/cjk-display-metadata-pending.2026-09-04.json', 'utf8')) as { activationAuthorized?: unknown };
assert.equal(rightsReview.activationAuthorized, false);

const clientCandidates = clientLookup as Record<string, string>;
const backendCandidates = backendLookup as Record<string, string>;
for (const code of Object.keys(clientCandidates)) {
  assert.ok(clientCandidates[code], `Japanese set review candidate ${code} must contain English text`);
  assert.equal(backendCandidates[code], clientCandidates[code], `Client/backend Japanese candidate parity for ${code}`);
}

for (const [code, expected] of [
  ['SGG', 'High-Class Deck Gengar VMAX'],
  ['PPD', 'Team Plasma Powered Deck'],
  ['SVM', 'Starter Decks Generations'],
  ['SPZ', 'VSTAR&VMAX High-Class Deck Zeraora'],
  ['XYC', 'Xerneas-EX and Yveltal-EX Deck'],
] as const) {
  assert.equal((clientLookup as Record<string, string>)[code.toLowerCase()], expected);
  assert.equal(getClientEnglishSetDisplayName({ language: 'ja', setCode: code }), null);
  assert.equal(getBackendEnglishSetDisplayName({ language: 'ja', setCode: code }), null);
}

// Existing reviewed/manual runtime copy has precedence over a conflicting
// upstream translation instead of being silently overwritten.
assert.equal(clientLookup.m3, 'Nihil Zero');
assert.equal(getClientEnglishSetDisplayName({ language: 'ja', setCode: 'M3' }), 'Munikisu Zero');
assert.equal(getBackendEnglishSetDisplayName({ language: 'ja', setCode: 'M3' }), 'Munikisu Zero');

const nativeName = 'ハイクラスデッキ「ゲンガーVMAX」';
const supplementInput = { language: 'ja', setCode: 'SGG', localName: nativeName };
assert.equal(getPreferredSetDisplayName(supplementInput), nativeName);
assert.deepEqual(getBackendEnglishSetDisplaySupplement(supplementInput), getClientEnglishSetDisplaySupplement(supplementInput));
assert.deepEqual(getClientEnglishSetDisplaySupplement(supplementInput), {
  value: 'High-Class Deck Gengar VMAX',
  label: 'English set:',
  status: 'provider_metadata_english_supplement',
  provenance: 'tcgdex_mit_pinned_japanese_set_code_map+stackr_catalog_sets_identity_snapshot',
  authoritative: false,
});

// The provider map cannot cross-bind a supplement to a different native title
// or a conflicting code, even if the provider source contains that code.
assert.equal(getClientEnglishSetDisplaySupplement({ ...supplementInput, localName: '別のセット名' }), null);
assert.equal(getBackendEnglishSetDisplaySupplement({ ...supplementInput, localName: '別のセット名' }), null);
assert.equal(getClientEnglishSetDisplaySupplement({ ...supplementInput, raw: { set_code: 'PPD' } }), null);
assert.equal(getBackendEnglishSetDisplaySupplement({ ...supplementInput, raw: { set_code: 'PPD' } }), null);
assert.equal(getClientEnglishSetDisplaySupplement({ ...supplementInput, language: 'jp' }), null);
assert.equal(getBackendEnglishSetDisplaySupplement({ ...supplementInput, language: 'jp' }), null);

for (const ambiguous of [
  { setCode: 'SMP', localName: '映画「ミュウツーの逆襲 EVOLUTION」パンフレット' },
  { setCode: 'XYP', localName: 'ポケモンカードゲーム教室2013　参加賞' },
  { setCode: 'SM3+', localName: '強化拡張パック「ひかる伝説」' },
  { setCode: 'SM4+', localName: 'ハイクラスパック「GXバトルブースト」' },
]) {
  const clientSupplement = getClientEnglishSetDisplaySupplement({ language: 'ja', ...ambiguous });
  const backendSupplement = getBackendEnglishSetDisplaySupplement({ language: 'ja', ...ambiguous });
  assert.deepEqual(backendSupplement, clientSupplement);
  assert.notEqual(clientSupplement?.status, 'provider_metadata_english_supplement');
}

process.env.STACKR_DISABLE_TCGDEX_METADATA = 'true';
assert.equal(getClientEnglishSetDisplaySupplement(supplementInput), null);
assert.equal(getBackendEnglishSetDisplaySupplement(supplementInput), null);
delete process.env.STACKR_DISABLE_TCGDEX_METADATA;

assert.equal(getClientEnglishSetDisplayName({ language: 'zh-cn', setCode: 'SGG', localName: '测试' }), null);
assert.equal(getBackendEnglishSetDisplayName({ language: 'zh-cn', setCode: 'SGG', localName: '测试' }), null);
assert.equal(getClientEnglishSetDisplayName({ setCode: 'SGG' }), null);
assert.equal(getBackendEnglishSetDisplayName({ setCode: 'SGG' }), null);
assert.equal(getClientEnglishSetDisplayName({ id: 'jp:SGG' }), null);
assert.equal(getBackendEnglishSetDisplayName({ id: 'jp:SGG' }), null);
assert.equal(getClientEnglishSetDisplaySupplement({ language: 'ja', setCode: 'SGG' }), null);
assert.equal(getBackendEnglishSetDisplaySupplement({ language: 'ja', setCode: 'SGG' }), null);

console.log('Pinned TCGdex Japanese set English supplements passed their green native-primary runtime gate');
