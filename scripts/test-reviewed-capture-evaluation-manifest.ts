import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildReviewedCaptureEvaluationManifest } from './build-reviewed-capture-evaluation-manifest';

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

const root = mkdtempSync(path.join(tmpdir(), 'stackr-reviewed-captures-'));
try {
  const session = path.join(root, 'Magneton_1');
  mkdirSync(session);
  const pixels = Buffer.from('private-approved-capture');
  const hash = createHash('sha256').update(pixels).digest('hex');
  writeFileSync(path.join(session, 'one.png'), pixels);
  writeFileSync(path.join(session, 'duplicate.png'), pixels);

  const columns = [
    'language', 'physical_card_session_id', 'source_folder', 'file_name', 'relative_path',
    'width', 'height', 'bytes', 'sha256', 'source_kind', 'image_rights_status',
    'review_status', 'label_verification_status', 'card_side', 'set_code',
    'collector_number', 'variant', 'finish', 'expected_card_name', 'lighting_category',
    'sleeve_state', 'holder_state', 'notes',
  ];
  const row = {
    language: 'zh-cn', physical_card_session_id: 'Magneton_1', source_folder: 'Magneton_1',
    file_name: 'one.png', relative_path: 'Magneton_1/one.png', width: '540', height: '720',
    bytes: String(pixels.length), sha256: hash, source_kind: 'real_capture',
    image_rights_status: 'user_consent', review_status: 'confirmed',
    label_verification_status: 'reviewed', card_side: 'front', set_code: '151c',
    collector_number: '082/151', variant: 'normal', finish: 'normal',
    expected_card_name: 'Magneton', lighting_category: '', sleeve_state: '',
    holder_state: 'none', notes: 'fixture',
  };
  const duplicate = { ...row, file_name: 'duplicate.png', relative_path: 'Magneton_1/duplicate.png' };
  writeFileSync(
    path.join(root, 'capture-review-manifest.csv'),
    `${columns.map(csvCell).join(',')}\n${[row, duplicate].map((item) => columns.map((column) => csvCell(item[column as keyof typeof item])).join(',')).join('\n')}\n`,
  );
  writeFileSync(path.join(root, 'capture-consent-evidence.json'), `\uFEFF${JSON.stringify({
    schemaVersion: 'stackr-stage6-capture-consent-v1.0.0',
    recordedAt: '2026-08-05T00:00:00.000Z',
    scope: 'private_model_evaluation_and_training',
    ownerStatement: 'Fixture consent.',
    reviewedPhysicalCardSessions: ['Magneton_1'],
    productionPublicationApproved: false,
  })}`);

  const manifest = buildReviewedCaptureEvaluationManifest({
    root,
    generatedAt: '2026-08-05T00:00:00.000Z',
  });
  assert.equal(manifest.summary.inputRows, 2);
  assert.equal(manifest.summary.uniqueImages, 1);
  assert.equal(manifest.summary.exactDuplicateImagesRemoved, 1);
  assert.equal(manifest.summary.identityClasses, 1);
  assert.equal(manifest.summary.hasTwoSessionsPerIdentity, false);
  assert.equal(manifest.summary.explicitSessionRolesDeclared, false);
  assert.equal(manifest.summary.protectedTestEligible, false);
  assert.equal(manifest.evaluationPolicy.productionAcceptanceAllowed, false);
  assert.equal(manifest.images[0].language, 'zh-Hans');
  assert.equal(manifest.images[0].relativePath, 'Magneton_1/duplicate.png');
  assert.ok(!JSON.stringify(manifest).includes(root));

  const protectedSession = path.join(root, 'Magneton_2');
  mkdirSync(protectedSession);
  const protectedPixels = Buffer.from('independent-protected-capture');
  const protectedHash = createHash('sha256').update(protectedPixels).digest('hex');
  writeFileSync(path.join(protectedSession, 'protected.png'), protectedPixels);
  const protectedRow = {
    ...row,
    physical_card_session_id: 'Magneton_2',
    source_folder: 'Magneton_2',
    file_name: 'protected.png',
    relative_path: 'Magneton_2/protected.png',
    bytes: String(protectedPixels.length),
    sha256: protectedHash,
  };
  writeFileSync(
    path.join(root, 'capture-review-manifest.csv'),
    `${columns.map(csvCell).join(',')}\n${[row, duplicate, protectedRow].map((item) => columns.map((column) => csvCell(item[column as keyof typeof item])).join(',')).join('\n')}\n`,
  );
  writeFileSync(path.join(root, 'capture-consent-evidence.json'), JSON.stringify({
    schemaVersion: 'stackr-stage6-capture-consent-v1.2.0',
    scope: 'private_model_evaluation_and_training',
    ownerStatement: 'Fixture protected-split consent.',
    reviewedPhysicalCardSessions: ['Magneton_1', 'Magneton_2'],
    modelSelectionPhysicalCardSessions: ['Magneton_1'],
    protectedTestPhysicalCardSessions: ['Magneton_2'],
    productionPublicationApproved: false,
  }));
  const protectedManifest = buildReviewedCaptureEvaluationManifest({ root });
  assert.equal(protectedManifest.summary.hasTwoSessionsPerIdentity, true);
  assert.equal(protectedManifest.summary.explicitSessionRolesDeclared, true);
  assert.equal(protectedManifest.summary.modelSelectionPhysicalCardSessions, 1);
  assert.equal(protectedManifest.summary.protectedTestPhysicalCardSessions, 1);
  assert.equal(protectedManifest.summary.protectedTestEligible, true);
  assert.deepEqual(
    protectedManifest.images.map((image) => image.evaluationRole).sort(),
    ['model_selection', 'protected_test'],
  );
  assert.equal(protectedManifest.evaluationPolicy.productionAcceptanceAllowed, false);

  writeFileSync(path.join(root, 'capture-consent-evidence.json'), JSON.stringify({
    schemaVersion: 'stackr-stage6-capture-consent-v1.1.0',
    scope: 'public_catalogue_model_evaluation_training_and_production',
    ownerStatement: 'Fixture public-production consent.',
    reviewedPhysicalCardSessions: ['Magneton_1', 'Magneton_2'],
    modelSelectionPhysicalCardSessions: ['Magneton_1'],
    protectedTestPhysicalCardSessions: ['Magneton_2'],
    productionPublicationApproved: true,
  }));
  const publicManifest = buildReviewedCaptureEvaluationManifest({ root });
  assert.equal(publicManifest.productionPublicationApproved, true);
  assert.equal(publicManifest.publicationPolicy.cataloguePublicationAllowed, true);
  assert.equal(publicManifest.publicationPolicy.derivativeGenerationAllowed, true);
  assert.equal(publicManifest.evaluationPolicy.productionAcceptanceAllowed, false);

  writeFileSync(path.join(root, 'capture-consent-evidence.json'), JSON.stringify({
    scope: 'public_catalogue_model_evaluation_training_and_production',
    ownerStatement: 'Fixture incomplete public consent.',
    reviewedPhysicalCardSessions: ['Magneton_1', 'Magneton_2'],
    productionPublicationApproved: false,
  }));
  assert.throws(
    () => buildReviewedCaptureEvaluationManifest({ root }),
    /must explicitly approve production publication/,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('Reviewed capture evaluation manifest tests passed.');
