/**
 * Validates a prospective Marnie runtime replacement without creating runtime
 * input or claiming that the canonical correction has been applied.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  OWNER_APPROVED_CARD_ENGLISH_NAME_METADATA as metadata,
  OWNER_APPROVED_CARD_ENGLISH_NAME_RECORDS as currentRecords,
} from '../backend/lib/generated/ownerApprovedCardEnglishNames.js';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const normalizedHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const candidate = readJson('docs/audits/20261011/marnie-runtime-correction-candidate.json');
const proposal = readJson('docs/audits/20261010/marnie-alias-correction.json');
const before = readJson('docs/audits/20261011/marnie-before-image.receipt.json');

assert.equal(candidate.status, 'pending_canonical_write_and_owner_approval');
assert.equal(candidate.runtimeGenerationPerformed, false);
assert.equal(candidate.canonicalDatabaseWriteAuthorized, false);
assert.equal(candidate.generatorConsumable, false);
assert.equal(normalizedHash(proposal), candidate.sourceBindings.proposalNormalizedSha256);
assert.equal(normalizedHash(before), candidate.sourceBindings.beforeImageNormalizedSha256);
assert.equal(candidate.sourceBindings.currentAcceptedInputSha256, proposal.runtimeSource.acceptedInputSha256);

const proposedRows = candidate.replacement.printings;
const proposedIds = proposedRows.map(({ printingId }) => printingId);
assert.equal(proposedRows.length, 12);
assert.deepEqual(proposedIds, [...proposedIds].sort());
assert.equal(new Set(proposedIds).size, proposedIds.length);
for (const row of proposedRows) {
  assert.deepEqual(Object.keys(row).sort(), ['collectorNumber', 'expectedPublicUpdatedAt', 'language', 'nativeName', 'printingId', 'setId']);
  assert.equal(row.language, 'zh-tw');
  assert.equal(row.nativeName, '瑪俐');
  assert.match(row.printingId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u);
}

const proposalRows = proposal.candidates.map((row) => ({
  printingId: row.printingId, language: row.language, nativeName: row.nativeName,
  setId: row.set.setId, collectorNumber: row.collectorNumber.value,
  expectedPublicUpdatedAt: row.expectedPublicUpdatedAt,
})).sort((a, b) => a.printingId.localeCompare(b.printingId));
assert.deepEqual(proposedRows, proposalRows);
assert.deepEqual(proposedIds, [...before.cohort.printingIds].sort());
const beforeRows = before.printingBefore.map((row) => ({
  printingId: row.printingId, language: row.language, nativeName: row.nativeName,
  setId: row.setId, collectorNumber: row.collectorNumber,
  expectedPublicUpdatedAt: row.updatedAt,
})).sort((a, b) => a.printingId.localeCompare(b.printingId));
assert.deepEqual(proposedRows, beforeRows, 'Candidate identity and timestamps must match the captured before-image.');

const expectedCurrent = ['zh-tw', '瑪俐', candidate.replacement.expectedCurrentEnglishName, proposedIds];
const expectedReplacement = candidate.replacement.expectedGeneratedRecord;
assert.deepEqual(expectedReplacement, ['zh-tw', '瑪俐', 'Marnie', proposedIds]);
const appliedReadbackPath = 'docs/audits/20261011/marnie-canonical-commit.readback.json';
const hasAppliedReadback = existsSync(appliedReadbackPath) && readJson(appliedReadbackPath).runtimeGenerationPerformed === true;
const staleGroups = currentRecords.filter(([language, nativeName]) => language === 'zh-tw' && nativeName === '瑪俐');
assert.deepEqual(staleGroups, [hasAppliedReadback ? expectedReplacement : expectedCurrent],
  hasAppliedReadback ? 'Applied runtime requires the separate receipt-bound Marnie check.' : 'Current runtime remains the known-bad baseline.');

if (hasAppliedReadback) {
  await import('./test-marnie-applied-runtime-readback.mjs');
  assert.equal(metadata.source, 'release55_readback_baseline');
  assert.equal(metadata.recordsSha256, '6de8551e043ced800b359a8fb952548649eb042922abf9cae7637c35933c636e');
  assert.equal(metadata.canonicalDatabaseWriteAuthorized, false);
} else {
  assert.equal(candidate.sourceBindings.currentAcceptedInputSha256, metadata.inputSha256.accepted);
  assert.equal(metadata.recordsSha256, proposal.runtimeSource.expectedRecordsSha256);
}

const genuinePikachuIds = new Set(currentRecords
  .filter(([language, nativeName, englishName]) => language === 'zh-tw' && nativeName === '皮卡丘' && englishName === 'Pikachu')
  .flatMap(([, , , ids]) => ids));
assert.ok(genuinePikachuIds.size > 0);
assert.equal(proposedIds.some((id) => genuinePikachuIds.has(id)), false);

if (!hasAppliedReadback) {
  const prospectiveRecords = currentRecords.map((record) => record === staleGroups[0] ? expectedReplacement : record);
  assert.equal(prospectiveRecords.length, currentRecords.length);
  const changedIndices = currentRecords.flatMap((record, index) => JSON.stringify(record) === JSON.stringify(prospectiveRecords[index]) ? [] : [index]);
  assert.deepEqual(changedIndices, [currentRecords.indexOf(staleGroups[0])]);
  for (let index = 0; index < currentRecords.length; index += 1) {
    if (changedIndices.includes(index)) continue;
    assert.strictEqual(prospectiveRecords[index], currentRecords[index]);
  }
}
console.log(hasAppliedReadback
  ? 'Marnie historical candidate remains immutable; receipt-bound applied runtime check passed. Backend/device delivery is not established here.'
  : 'Marnie prospective runtime replacement is isolated, hash-bound, and pending canonical write/owner approval');
