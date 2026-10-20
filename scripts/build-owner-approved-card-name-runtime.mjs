/** Build the display-only runtime from English-name selections already approved and applied. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { cleanCardEnglishName, normalizeCardTranslationLanguage } from '../backend/lib/cardNameTranslations.js';

const target = 'backend/lib/generated/ownerApprovedCardEnglishNames.js';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.join('=')];
}));
if (Object.hasOwn(args, 'check')) {
  const data = await import(pathToFileURL(resolve(target)).href);
  assert.equal(hash(JSON.stringify(data.OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS)), data.OWNER_APPROVED_CARD_ENGLISH_NAME_METADATA.recordsSha256);
  assert.equal(data.OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS.reduce((count, record) => count + record[3].length, 0), data.OWNER_APPROVED_CARD_ENGLISH_NAME_METADATA.approvedPrintings);
  assert.equal(hash(JSON.stringify(data.OWNER_APPROVED_CARD_ENGLISH_NAME_LEGACY_LINKS)), data.OWNER_APPROVED_CARD_ENGLISH_NAME_METADATA.legacyLinksSha256);
  assert.equal(data.OWNER_APPROVED_CARD_ENGLISH_NAME_LEGACY_LINKS.length, data.OWNER_APPROVED_CARD_ENGLISH_NAME_METADATA.legacyLinksCount);
  assert.equal(data.OWNER_APPROVED_CARD_ENGLISH_NAME_METADATA.verifiedOfficial, false);
  console.log('Owner-approved English-name runtime hashes and record counts match');
} else {
  assert.ok(args.accepted && args.bridged && args.proposals && args['legacy-links'], 'Provide --accepted, --bridged, --proposals and --legacy-links JSON paths.');
  const readbackMode = Boolean(args['readback-correction']);
  const readback = readbackMode ? JSON.parse(readFileSync(args['readback-correction'], 'utf8')) : null;
  if (readbackMode) {
    assert.equal(readback.schemaVersion, 'stackr-marnie-applied-readback-v1');
    assert.equal(readback.canonicalApplied, true); assert.equal(readback.independentReadbackVerified, true);
    assert.equal(readback.afterCommitCaptureSha256, 'ad7258476484491834fdc316070928493f39b9585e759542c953035a72237a99');
    assert.equal(readback.beforeCommitCaptureSha256, '8ceae7e3d1b417b9b057042cedfbd46b86346c690afcd4b2bc9dca1bc44fdb73');
    assert.deepEqual(readback.counts, { names: 26, variants: 13, printings: 12, variantMembership: 13, printingMembership: 12 });
    assert.equal(readback.genuinePikachuSentinelCount, 22); assert.equal(readback.targetSentinelOverlap, 0);
    assert.equal(readback.forwardReceiptCount, 25); assert.equal(readback.deltaReceiptCount, 25);
    assert.deepEqual(readback.sequence, { min: 41920, max: 41944 }); assert.equal(readback.publishedMaximum, 41944);
    assert.equal(readback.baseline.recordsSha256, '3309ae44ba128205f00276e78a7eb05e5c00e0069eac140f653e951566b95581');
    assert.equal(readback.baseline.legacyLinksSha256, '4c0350535e295f47ba41f3be333f0508bee94f7a256548e2db45abb980c683fb');
    assert.equal(readback.expectedCorrectedRecordsSha256, '6de8551e043ced800b359a8fb952548649eb042922abf9cae7637c35933c636e');
    assert.ok(Array.isArray(readback.marniePrintingIds) && readback.marniePrintingIds.length === 12);
    const proposal = JSON.parse(readFileSync(readback.proposalPath, 'utf8'));
    assert.equal(hash(JSON.stringify(proposal)), '4e45815a9eb6abcb8ac94c1986808557110fb1821559af30e0222510ba26b13b');
    assert.equal(readback.proposalNormalizedSha256, hash(JSON.stringify(proposal)));
    assert.deepEqual([...readback.marniePrintingIds].sort(), proposal.candidates.map(({ printingId }) => printingId).sort());
    assert.ok(typeof readback.approvalReference === 'string' && readback.approvalReference.length > 0);
    const before = JSON.parse(readFileSync(readback.beforeCapturePath, 'utf8')); const after = JSON.parse(readFileSync(readback.afterCapturePath, 'utf8'));
    assert.equal(hash(JSON.stringify(before)), readback.beforeCommitCaptureSha256); assert.equal(hash(JSON.stringify(after)), readback.afterCommitCaptureSha256);
  }
  const sources = ['accepted', 'bridged', 'proposals'].map((key) => {
    const raw = readFileSync(args[key]);
    return { key, sha256: hash(raw), rows: JSON.parse(raw.toString('utf8')) };
  });
  const groups = new Map();
  const seen = new Set();
  const approvedById = new Map();
  const counts = {};
  for (const { rows } of sources) for (const row of rows) {
    assert.match(row.id, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u);
    assert.ok(!seen.has(row.id), `Duplicate approved printing: ${row.id}`);
    seen.add(row.id);
    approvedById.set(row.id, row);
    assert.equal(normalizeCardTranslationLanguage(row.language), row.language);
    assert.equal(cleanCardEnglishName(row.englishName), row.englishName);
    assert.ok(typeof row.nativeName === 'string' && row.nativeName.trim());
    const native = row.nativeName.normalize('NFC').replace(/\s+/gu, ' ');
    const key = JSON.stringify([row.language, native, row.englishName]);
    const group = groups.get(key) ?? [row.language, native, row.englishName, []];
    group[3].push(row.id);
    groups.set(key, group);
    counts[row.language] = (counts[row.language] ?? 0) + 1;
  }
  const records = [...groups.values()].map(([language, native, english, ids]) => [language, native, english, ids.sort()])
    .sort((a, b) => JSON.stringify(a.slice(0, 3)).localeCompare(JSON.stringify(b.slice(0, 3)), 'en'));
  const legacyInput = readFileSync(args['legacy-links']);
  if (readbackMode) {
    assert.deepEqual(Object.fromEntries(sources.map(({ key, sha256 }) => [key, sha256])), {
      accepted: readback.recoveredInputSha256.accepted,
      bridged: readback.recoveredInputSha256.bridged,
      proposals: readback.recoveredInputSha256.proposals,
    });
    assert.equal(hash(legacyInput), readback.recoveredInputSha256['legacy-links']);
  }
  const legacyIds = new Set();
  const legacyLinks = JSON.parse(legacyInput.toString('utf8')).links.map((link) => {
    const row = approvedById.get(link.printingId);
    assert.ok(row, `Unapproved legacy target: ${link.printingId}`);
    assert.equal(link.language, row.language);
    assert.equal(link.nativeName, row.nativeName);
    assert.equal(link.englishName, row.englishName);
    assert.equal(link.setId, `${row.language}:${row.setCode}`);
    assert.equal(link.collectorNumber, row.collectorNumber);
    assert.equal(link.legacyId, `${link.setId}-${link.collectorNumber}`);
    assert.ok(!legacyIds.has(link.legacyId.toLowerCase()), `Duplicate legacy link: ${link.legacyId}`);
    legacyIds.add(link.legacyId.toLowerCase());
    return [link.legacyId, link.printingId];
  }).sort((a, b) => a[0].localeCompare(b[0], 'en'));
  if (readbackMode) {
    assert.equal(hash(JSON.stringify(records)), readback.expectedCorrectedRecordsSha256);
    assert.equal(hash(JSON.stringify(legacyLinks)), readback.baseline.legacyLinksSha256);
    const changed = records.filter(([language, native, english, ids]) => language === 'zh-tw' && native === '瑪俐' && english === 'Marnie');
    assert.deepEqual(changed, [['zh-tw', '瑪俐', 'Marnie', [...readback.marniePrintingIds].sort()]]);
  }
  const metadata = readbackMode ? {
    schemaVersion: 'stackr-owner-approved-card-english-names-v1',
    source: 'release55_readback_baseline',
    recoveredFromGeneratedRuntime: readback.baseline.sourceRevision,
    recoveredBaselineRecordsSha256: readback.baseline.recordsSha256,
    recoveredBaselineLegacyLinksSha256: readback.baseline.legacyLinksSha256,
    correctionProposalSha256: readback.proposalNormalizedSha256,
    approvalReference: readback.approvalReference,
    appliedReadbackSha256: readback.afterCommitCaptureSha256,
    marniePrintingIds: [...readback.marniePrintingIds].sort(),
    approvedPrintings: seen.size, languageCounts: counts,
    recordsSha256: hash(JSON.stringify(records)),
    recoveredInputSha256: Object.fromEntries(sources.map(({ key, sha256 }) => [key, sha256])),
    recoveredLegacyInputSha256: hash(legacyInput), legacyLinksSha256: hash(JSON.stringify(legacyLinks)), legacyLinksCount: legacyLinks.length,
    ownerApprovedProposalCardIds: sources.find(({ key }) => key === 'proposals').rows.map(({ id }) => id).sort(),
    verifiedOfficial: false, canonicalDatabaseWriteAuthorized: false,
    scope: 'English display text only. Exact printing overrides require matching full native name and language. Ambiguous native-name groups require a printing ID.',
  } : {
    schemaVersion: 'stackr-owner-approved-card-english-names-v1',
    source: 'owner_approved_applied_english_metadata', approvalDate: '2026-10-06',
    approvedPrintings: seen.size, languageCounts: counts,
    recordsSha256: hash(JSON.stringify(records)),
    inputSha256: Object.fromEntries(sources.map(({ key, sha256 }) => [key, sha256])),
    legacyInputSha256: hash(legacyInput), legacyLinksSha256: hash(JSON.stringify(legacyLinks)), legacyLinksCount: legacyLinks.length,
    ownerApprovedProposalCardIds: sources.find(({ key }) => key === 'proposals').rows.map(({ id }) => id).sort(),
    verifiedOfficial: false, canonicalDatabaseWriteAuthorized: false,
    scope: 'English display text only. Exact printing overrides require matching full native name and language. Ambiguous native-name groups require a printing ID.',
  };
  const content = (readbackMode ? '// Generated from recovered runtime projection and the verified release55 canonical correction. Display only.\n' : '// Generated from owner-approved English names already applied to Stackr. Display only.\n')
    + `export const OWNER_APPROVED_CARD_ENGLISH_NAME_METADATA = ${JSON.stringify(metadata, null, 2)};\n`
    + `export const OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS = ${JSON.stringify(records)};\n`
    + `export const OWNER_APPROVED_CARD_ENGLISH_NAME_LEGACY_LINKS = ${JSON.stringify(legacyLinks)};\n`;
  writeFileSync(target, content);
  console.log(JSON.stringify({ approvedPrintings: seen.size, nativeTitleRecords: records.length, bytes: Buffer.byteLength(content) }));
}
