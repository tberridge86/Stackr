import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { OWNER_APPROVED_CARD_ENGLISH_NAME_METADATA as metadata, OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS as records, OWNER_APPROVED_CARD_ENGLISH_NAME_LEGACY_LINKS as links } from '../backend/lib/generated/ownerApprovedCardEnglishNames.js';
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const receipt = read('docs/audits/20261011/marnie-canonical-commit.readback.json');
const before = read(receipt.beforeCapturePath); const after = read(receipt.afterCapturePath);
const verification = read('docs/audits/20261011/marnie-canonical-commit.verification.json');
assert.equal(receipt.schemaVersion, 'stackr-marnie-applied-readback-v1'); assert.equal(receipt.canonicalApplied, true); assert.equal(receipt.independentReadbackVerified, true); assert.equal(receipt.runtimeGenerationPerformed, true, 'Canonical data is applied, but runtime generation has not been delivered yet.');
assert.equal(sha(before), receipt.beforeCommitCaptureSha256); assert.equal(sha(after), receipt.afterCommitCaptureSha256);
assert.equal(receipt.beforeCommitCaptureSha256, '8ceae7e3d1b417b9b057042cedfbd46b86346c690afcd4b2bc9dca1bc44fdb73');
assert.equal(receipt.afterCommitCaptureSha256, 'ad7258476484491834fdc316070928493f39b9585e759542c953035a72237a99');
const proposal = read(receipt.proposalPath); const ids = proposal.candidates.map(({printingId}) => printingId).sort();
assert.equal(sha(proposal), '4e45815a9eb6abcb8ac94c1986808557110fb1821559af30e0222510ba26b13b');
assert.equal(receipt.proposalNormalizedSha256, sha(proposal));
assert.deepEqual(receipt.marniePrintingIds, ids); assert.equal(ids.length, 12);
assert.deepEqual(receipt.counts, { names:26, variants:13, printings:12, variantMembership:13, printingMembership:12 });
for (const key of ['genuinePikachuSentinelCount','targetSentinelOverlap','forwardReceiptCount','deltaReceiptCount']) assert.equal(receipt[key], key === 'targetSentinelOverlap' ? 0 : key === 'genuinePikachuSentinelCount' ? 22 : 25);
assert.deepEqual(receipt.sequence, {min:41920,max:41944}); assert.equal(receipt.publishedMaximum,41944);
assert.equal(before.data.forwardReceiptCount,0); assert.equal(after.data.forwardReceiptCount,25); assert.equal(after.data.deltaReceiptCount,25);
assert.ok(before.data.state.printings.every((row)=>row.english_display_name==='Pikachu'));
assert.ok(after.data.state.printings.every((row)=>row.english_display_name==='Marnie'));
assert.equal(after.data.state.names.filter((row)=>row.language_code==='en').every((row)=>row.name==='Marnie'&&row.normalized_name==='marnie'),true);
assert.equal(after.data.state.names.filter((row)=>row.language_code==='zh-tw').every((row)=>row.name==='瑪俐'),true);
assert.equal(verification.immutableVariantsAndMemberships,true); assert.equal(verification.immutableNativeAliases,true); assert.equal(verification.genuinePikachuUnchanged,true); assert.equal(verification.changed.length,25);
assert.equal(metadata.recordsSha256, receipt.expectedCorrectedRecordsSha256); assert.equal(createHash('sha256').update(JSON.stringify(records)).digest('hex'), receipt.expectedCorrectedRecordsSha256); assert.equal(createHash('sha256').update(JSON.stringify(links)).digest('hex'), receipt.baseline.legacyLinksSha256);
assert.equal(receipt.expectedCorrectedRecordsSha256, '6de8551e043ced800b359a8fb952548649eb042922abf9cae7637c35933c636e');
assert.equal(receipt.baseline.legacyLinksSha256, '4c0350535e295f47ba41f3be333f0508bee94f7a256548e2db45abb980c683fb');
assert.equal(metadata.source, 'release55_readback_baseline');
assert.equal(metadata.appliedReadbackSha256, receipt.afterCommitCaptureSha256);
assert.equal(metadata.correctionProposalSha256, receipt.proposalNormalizedSha256);
assert.equal(metadata.approvalReference, receipt.approvalReference);
assert.equal(receipt.baseline.sourceRevision, '154fb2287166415bd2b6dbdf6e9a08eca3f42c5a');
assert.equal(metadata.recoveredFromGeneratedRuntime, receipt.baseline.sourceRevision);
assert.equal(metadata.recoveredBaselineRecordsSha256, '3309ae44ba128205f00276e78a7eb05e5c00e0069eac140f653e951566b95581');
assert.equal(metadata.recoveredBaselineLegacyLinksSha256, receipt.baseline.legacyLinksSha256);
assert.deepEqual(receipt.recoveredInputSha256, {
  accepted: '63a3ea5ef50e2c4411f85b141e91710c6ac989047f84228a64ce84a6edfdbd02',
  bridged: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  proposals: '9bf6afc54a2a3354fdcb261f231727978cfd597c096970416f7f11fdee31674e',
  'legacy-links': '504a49ddbf3bd9ea957a6b988f7c716fd1d3c128fa7ca5d1dba67aa987b15935',
});
assert.deepEqual(metadata.recoveredInputSha256, Object.fromEntries(Object.entries(receipt.recoveredInputSha256).filter(([key]) => key !== 'legacy-links')));
assert.equal(metadata.recoveredLegacyInputSha256, receipt.recoveredInputSha256['legacy-links']);
assert.equal(Object.hasOwn(metadata, 'inputSha256'), false);
assert.equal(metadata.verifiedOfficial, false); assert.equal(metadata.canonicalDatabaseWriteAuthorized, false);
assert.equal(Object.hasOwn(metadata, 'approvalDate'), false);
assert.deepEqual(records.filter(([language,native])=>language==='zh-tw'&&native==='瑪俐'), [['zh-tw','瑪俐','Marnie',ids]]);
console.log('Marnie applied runtime is fully bound to committed before/after readback.');
