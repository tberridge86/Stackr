import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getEnglishCardDisplayName, getEnglishCardDisplaySupplement } from '../backend/lib/cardDisplayNames.js';
import { resolveCardEnglishSupplement } from '../backend/lib/cardNameTranslations.js';
import {
  OWNER_APPROVED_CARD_ENGLISH_NAME_METADATA as metadata,
  OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS as records,
  OWNER_APPROVED_CARD_ENGLISH_NAME_LEGACY_LINKS as legacyLinks,
} from '../backend/lib/generated/ownerApprovedCardEnglishNames.js';
import { PUBLISHED_CARD_ENGLISH_NAMES_METADATA as publishedMetadata } from '../backend/lib/generated/publishedCardEnglishNames.js';

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert.equal(hash(records), metadata.recordsSha256);
assert.equal(metadata.recordsSha256, '3309ae44ba128205f00276e78a7eb05e5c00e0069eac140f653e951566b95581');
assert.equal(hash(legacyLinks), metadata.legacyLinksSha256);
assert.equal(metadata.approvedPrintings, 19_315);
assert.equal(metadata.verifiedOfficial, false);
assert.equal(metadata.canonicalDatabaseWriteAuthorized, false);
assert.equal(publishedMetadata.canonicalDatabaseWriteAuthorized, false);
assert.equal(publishedMetadata.snapshotSha256, 'd2cec4a113be8ea71cf65474065ff040cd251d9000afed1d07bbe06a4c22a94c');

const byId = new Map();
const languageCounts = {};
for (const [language, nativeName, englishName, cardIds] of records) {
  languageCounts[language] = (languageCounts[language] ?? 0) + cardIds.length;
  for (const cardId of cardIds) {
    assert.ok(!byId.has(cardId), 'Each approved printing must have one reviewed name');
    byId.set(cardId, { language, nativeName, englishName });
    const input = { id: cardId, language, localName: nativeName, englishDisplayName: 'Translation pending' };
    const supplement = getEnglishCardDisplaySupplement(input);
    assert.equal(supplement?.value, englishName, cardId);
    assert.equal(supplement?.provenance, 'published_stackr_exact_native_name');
    assert.equal(supplement?.authoritative, false);
    assert.equal(input.localName, nativeName, 'Display aliases preserve native text');
  }
}
assert.equal(byId.size, 19_315);
assert.deepEqual(languageCounts, metadata.languageCounts);
for (const cardId of metadata.ownerApprovedProposalCardIds) assert.ok(byId.has(cardId));
assert.equal(metadata.ownerApprovedProposalCardIds.length, 4);
assert.equal(legacyLinks.length, 8);
for (const [legacyId, printingId] of legacyLinks) {
  const record = byId.get(printingId);
  assert.equal(getEnglishCardDisplayName({ id: legacyId.toUpperCase(), language: record.language,
    localName: record.nativeName, englishDisplayName: 'Legacy incorrect title' }), record.englishName);
}

const ambiguous = records.filter(([language, native]) => language === 'ja' && native === 'ニドラン（デルタ種）');
assert.equal(ambiguous.length, 2);
assert.deepEqual(new Set(ambiguous.map((record) => record[2])), new Set(['Nidoran♀ δ', 'Nidoran♂ δ']));
assert.equal(getEnglishCardDisplayName({ language: 'ja', localName: ambiguous[0][1] }), null);
for (const [language, nativeName, englishName, ids] of ambiguous) {
  assert.equal(getEnglishCardDisplayName({ id: ids[0], language, localName: nativeName }), englishName);
  assert.equal(getEnglishCardDisplayName({ id: ids[0], language: 'zh-tw', localName: nativeName }), null);
  assert.notEqual(getEnglishCardDisplayName({ id: ids[0], language, localName: 'ニドラン' }), englishName);
}
assert.equal(getEnglishCardDisplayName({ language: 'ja', localName: 'unknown form ex',
  setId: 'ja:SV2a', collectorNumber: '003', raw: { dexId: [3] } }), null,
  'Collector number or species cannot prove a complete translated title');
assert.equal(getEnglishCardDisplayName({ language: 'en', localName: '151' }), null);
const reviewed = { source: 'provider_complete_native_name', status: 'reviewed_provider_metadata',
  verifiedOfficial: false, sourceEvidenceSha256: 'a'.repeat(64) };
const hammer = records.find(([language, native]) => language === 'ja' && native === 'あとだしハンマー');
assert.equal(resolveCardEnglishSupplement({ language: hammer[0], nativeName: hammer[1], cardIds: [hammer[3][0]],
  englishNames: ['Reviewed catalogue title'], englishNameProvenance: reviewed })?.value, 'Reviewed catalogue title');
assert.deepEqual(getEnglishCardDisplaySupplement({ id: hammer[3][0], language: hammer[0], localName: hammer[1],
  englishDisplayName: 'Reviewed catalogue title', englishDisplayProvenance: reviewed })?.canonicalProvenance, reviewed);
console.log('Backend approved names passed: 19,315 exact aliases, evidence hashes, four proposals, eight legacy links, ambiguity/language guards and native preservation.');
