import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getChineseSetEnglishTranslationDraft as getClientDraft,
  getEnglishSetDisplayName as getClientAuthoritativeName,
  getEnglishSetDisplaySupplement as getClientSupplement,
  getPreferredSetDisplayName,
} from '../lib/pokemonDisplayNames';
import {
  CHINESE_SET_TRANSLATION_DRAFT_LOOKUP_METADATA as clientMetadata,
  CHINESE_SET_TRANSLATION_DRAFTS_BY_LANGUAGE as clientLookup,
} from '../lib/generated/chineseSetTranslationDrafts.generated';
import {
  getChineseSetEnglishTranslationDraft as getBackendDraft,
  getEnglishSetDisplayName as getBackendAuthoritativeName,
  getEnglishSetDisplaySupplement as getBackendSupplement,
} from '../backend/lib/cardDisplayNames.js';
import {
  CHINESE_SET_TRANSLATION_DRAFT_LOOKUP_METADATA as backendMetadata,
  CHINESE_SET_TRANSLATION_DRAFTS_BY_LANGUAGE as backendLookup,
} from '../backend/lib/generated/chineseSetTranslationDrafts.generated.mjs';

assert.deepEqual(backendMetadata, clientMetadata);
assert.deepEqual(backendLookup, clientLookup);
assert.equal(clientMetadata.englishDisplayNameAuthoritative, false);
assert.equal(clientMetadata.displayLabel, 'English translation:');
assert.equal(clientMetadata.nativeNameSource, 'catalogue/chinese-set-translation-draft-native-name-source.json');
assert.equal(clientMetadata.providerBaselineSnapshot?.providerBaselinePath, 'reports/catalogue/provider-baseline/2026-08-14/raw/{zh-cn,zh-tw}.sets.json');
assert.deepEqual(clientMetadata.counts, { 'zh-cn': 49, 'zh-tw': 77 });
assert.deepEqual(clientMetadata.exclusionCounts, {});
assert.equal(clientMetadata.tcgdexChineseIdentityDisplaySource?.count, 2);
assert.equal(clientMetadata.tcgdexChineseIdentityDisplaySource?.sha256, 'bef7c15704acca9b2e993398d3f36a9acc630619339dc83dc20284d7983bc629');
assert.equal(clientMetadata.tcgdexChineseIdentityDisplaySource?.upstream.pinnedCommit, 'dd4fc9460b54b91c25df750c68ca36b9946448e2');
assert.equal(clientMetadata.tcgdexChineseIdentityDisplaySource?.policy.canonicalDatabaseWriteAuthorized, false);
assert.equal(clientMetadata.tcgdexChineseIdentityDisplaySource?.reviewedResolutionEvidence.evidenceId, 'provider-resolution:2026-08-14:42a5f7613be7f7e92c71d286');
assert.equal(clientMetadata.rightsGate.activationAuthorized, true);
assert.equal(clientMetadata.rightsGate.publicRuntimeImportAuthorized, true);
assert.equal(clientMetadata.rightsGate.canonicalDatabaseWriteAuthorized, false);
const rightsReview = JSON.parse(readFileSync('catalogue/rights-reviews/cjk-display-metadata-pending.2026-09-04.json', 'utf8')) as {
  activationAuthorized?: unknown;
  status?: unknown;
  supersedingRecords?: { path?: unknown }[];
};
assert.equal(rightsReview.activationAuthorized, false);
assert.equal(rightsReview.status, 'partially_superseded_pending');
assert.ok(rightsReview.supersedingRecords?.some((record) => (
  record.path === 'catalogue/rights-reviews/cjk-editorial-set-translation-owner-approved.2026-09-04.json'
)));

const simplifiedDraft = { language: 'zh-cn', setCode: 'CS5.5C', localName: '暗影夺辉' };
const traditionalDraft = { language: 'zh-tw', setCode: 'SVAM', localName: '起始組合ex 新葉喵&路卡利歐ex' };

for (const [name, draft] of [['simplified', simplifiedDraft], ['traditional', traditionalDraft]] as const) {
  const client = getClientDraft(draft);
  const backend = getBackendDraft(draft);
  assert.deepEqual(backend, client, `${name} client/backend draft parity`);
  assert.ok(client, `${name} exact draft is active as a runtime-only supplement`);
  assert.equal(getClientAuthoritativeName(draft), null, `${name} draft must not become english_display_name`);
  assert.equal(getBackendAuthoritativeName(draft), null, `${name} backend draft must not become english_display_name`);
  assert.equal(getPreferredSetDisplayName(draft), draft.localName, `${name} native name stays primary`);
}

for (const [draft, expected] of [
  [{ language: 'zh-cn', setCode: 'CSV1C', localName: '亘古开来' }, 'Eternal Birth'],
  [{ language: 'zh-cn', setCode: 'CBB1C', localName: '宝石包 第一卷' }, 'Gem Pack Vol. 1'],
] as const) {
  const normalizedCode = draft.setCode.toLowerCase().replace(/[^a-z0-9.]+/g, '');
  const clientSimplifiedLookup = clientLookup['zh-cn'] as Record<string, { englishTranslation: string }>;
  const backendSimplifiedLookup = backendLookup['zh-cn'] as Record<string, { englishTranslation: string }>;
  assert.equal(clientSimplifiedLookup[normalizedCode]?.englishTranslation, expected);
  assert.equal(backendSimplifiedLookup[normalizedCode]?.englishTranslation, expected);
  assert.deepEqual(getClientDraft(draft), { value: expected, label: 'English translation:', status: 'model_translation_draft', provenance: 'stackr_owner_approved_editorial_set_translation_runtime_map', authoritative: false });
  assert.deepEqual(getBackendDraft(draft), getClientDraft(draft));
  assert.equal(getClientAuthoritativeName(draft), null);
  assert.equal(getBackendAuthoritativeName(draft), null);
  assert.equal(getPreferredSetDisplayName(draft), draft.localName);
}

for (const input of [
  { language: 'zh-cn', setCode: 'CSV1C' },
  { language: 'zh-cn', setCode: 'CBB1C' },
  { language: 'zh-cn', setCode: 'CSV1C', localName: '宝石包 第一卷' },
  { language: 'zh-cn', setCode: 'CBB1C', localName: '亘古开来' },
  { language: 'zh-cn', setCode: 'CSV1C', localName: '不匹配' },
  { language: 'zh-tw', setCode: 'CBB1C', localName: '宝石包 第一卷' },
] as const) {
  assert.equal(getClientDraft(input), null, `Unsafe pinned identity match must fail: ${JSON.stringify(input)}`);
  assert.equal(getBackendDraft(input), null, `Unsafe pinned identity match must fail in backend: ${JSON.stringify(input)}`);
}

for (const [message, input] of [
  ['A code-only draft lookup is forbidden', { language: 'zh-cn', setCode: 'CS5.5C' }],
  ['A mismatched native title is forbidden', { ...simplifiedDraft, localName: '收集啦151 希望' }],
] as const) {
  assert.equal(getClientDraft(input), null, message);
  assert.equal(getBackendDraft(input), null, `${message} (backend)`);
}
assert.deepEqual(
  getClientDraft({ ...traditionalDraft, localName: '起始組合ex  新葉喵&路卡利歐　ex' }),
  getClientDraft(traditionalDraft),
  'Whitespace-normalized native title is accepted only for the same exact language and code',
);

assert.equal(getClientDraft({ language: 'zh-cn', setCode: 'SVAM', localName: traditionalDraft.localName }), null, 'Traditional-only code cannot leak into simplified Chinese');
assert.equal(getClientDraft({ language: 'zh-tw', setCode: 'CS5.5C', localName: simplifiedDraft.localName }), null, 'Simplified-only code cannot leak into Traditional Chinese');
assert.equal(getClientDraft({ language: 'ja', setCode: 'CS5.5C', localName: simplifiedDraft.localName }), null, 'Japanese must not use a Chinese draft');
assert.equal(getClientDraft({ id: 'zh-tw:SVAM' }), null, 'An ID alone is not an exact language-and-code match');
assert.equal(getClientDraft({ language: 'zh-tw', raw: { id: 'SVAM' } }), null, 'A provider ID alone is not a set code');
assert.equal(getClientDraft({ language: 'zh-hant', setCode: 'SVAM' }), null, 'Language aliases are intentionally excluded from draft lookup');
assert.equal(getClientDraft({ language: 'zh-tw', setCode: 'unknown' }), null, 'Missing draft codes stay missing');

const reviewed = { ...simplifiedDraft, englishDisplayName: 'Collect 151 Hope — reviewed' };
const clientReviewedSupplement = getClientSupplement(reviewed);
const backendReviewedSupplement = getBackendSupplement(reviewed);
assert.deepEqual(backendReviewedSupplement, clientReviewedSupplement);
assert.deepEqual(clientReviewedSupplement, {
  value: 'Collect 151 Hope — reviewed',
  label: 'English set:',
  status: 'authoritative_english_display_name',
  provenance: 'canonical_or_provider_english_display_name',
  authoritative: true,
});

const clientDraftSupplement = getClientSupplement(simplifiedDraft);
const backendDraftSupplement = getBackendSupplement(simplifiedDraft);
assert.deepEqual(backendDraftSupplement, clientDraftSupplement);
assert.deepEqual(clientDraftSupplement, getClientDraft(simplifiedDraft));

process.env.STACKR_DISABLE_CJK_EDITORIAL_SET_TRANSLATIONS = 'true';
assert.equal(getClientDraft(simplifiedDraft), null);
assert.equal(getBackendDraft(simplifiedDraft), null);
delete process.env.STACKR_DISABLE_CJK_EDITORIAL_SET_TRANSLATIONS;

console.log('Chinese owner-approved editorial set translations passed exact runtime-only controls');
