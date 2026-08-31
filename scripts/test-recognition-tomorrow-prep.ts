import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildReviewedCaptureEvaluationManifest } from './build-reviewed-capture-evaluation-manifest';

const root = path.resolve(__dirname, '..');

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

function sha256(relativePath: string) {
  return createHash('sha256').update(readFileSync(path.join(root, relativePath))).digest('hex');
}

const readiness = readJson('deploy/evidence/recognition-readiness-2026-08-31.json');
const plan = readJson('ml/data_manifests/protected-six-card-capture-plan-v1.json');
const registry = readJson('ml/models/embedding-model-registry-v1.json');
const release = readJson('deploy/release-manifest.json');
const staging = readJson('deploy/evidence/staging-readiness-2026-08-11.json');
const pilot = readJson('deploy/evidence/dinov2-pilot-publication-approved-2026-08-06.json');
const catalogue = readJson('catalogue/zh-cn/151c/reviewed-owned-captures.json');

for (const source of readiness.sourceEvidence) {
  assert.equal(sha256(source.path), source.sha256, `Readiness source hash drifted: ${source.path}`);
}
assert.equal(sha256(plan.sourceIdentityEvidence.pilotReportPath), plan.sourceIdentityEvidence.pilotReportSha256);
assert.equal(sha256(plan.sourceIdentityEvidence.cataloguePath), plan.sourceIdentityEvidence.catalogueSha256);
assert.equal(sha256(plan.sourceIdentityEvidence.originalSessionPath), plan.sourceIdentityEvidence.originalSessionSha256);

const dino = registry.models.find((model: { modelId: string }) => model.modelId === 'dinov2_vits14');
assert.ok(dino, 'DINOv2 candidate is missing from the registry.');
assert.equal(dino.selectionStatus, 'candidate');
assert.equal(registry.selectedModelId, null);
assert.equal(release.releaseGates.activeModelSelected, false);
assert.equal(release.releaseGates.activeIndexValidated, false);
assert.equal(staging.modelAndIndex.candidateModelId, 'dinov2_vits14');
assert.equal(staging.modelAndIndex.selectedModelId, null);
assert.equal(staging.modelAndIndex.activeIndexVersion, null);

assert.equal(readiness.model.candidateSelectionStatus, dino.selectionStatus);
assert.equal(readiness.model.selectedModelId, registry.selectedModelId);
assert.equal(readiness.model.activeModelSelected, release.releaseGates.activeModelSelected);
assert.equal(readiness.index.activeIndexVersion, staging.modelAndIndex.activeIndexVersion);
assert.equal(readiness.index.activeIndexValidated, release.releaseGates.activeIndexValidated);
assert.equal(readiness.realCameraPilot.uniqueImages, pilot.dataset.uniqueImages);
assert.equal(readiness.realCameraPilot.identityClasses, pilot.dataset.identityClasses);
assert.equal(readiness.realCameraPilot.physicalCardSessions, pilot.dataset.physicalCardSessions);
assert.equal(readiness.realCameraPilot.developmentTop1, pilot.measurements.realCameraTop1);
assert.equal(pilot.evaluationIsolation.modelSelectionAndProtectedTestSeparated, false);
assert.equal(readiness.realCameraPilot.modelSelectionAndProtectedTestSeparated, false);
assert.equal(readiness.realCameraPilot.protectedPhysicalSessionMetricAvailable, false);
assert.equal(readiness.productionAccepted, false);

const pilotIdentities = pilot.retrieval.perIdentity
  .map((identity: { identityKey: string }) => identity.identityKey)
  .sort();
const plannedIdentities = plan.identities
  .map((identity: { identityKey: string }) => identity.identityKey)
  .sort();
assert.deepEqual(plannedIdentities, pilotIdentities, 'Capture-plan identities must exactly match the published pilot.');

const catalogueIdentities = catalogue.records.map((record: {
  set_code: string;
  collector_number: string;
  variant_code: string;
  finish_code: string;
  english_display_name: string;
}) => [
  record.set_code,
  `${record.collector_number}/151`,
  record.variant_code,
  record.finish_code,
  record.english_display_name.toLowerCase(),
  'zh-Hans',
].join('|')).sort();
assert.deepEqual(plannedIdentities, catalogueIdentities, 'Capture-plan identities must match the reviewed capture catalogue.');

assert.equal(plan.status, 'capture_required');
assert.equal(plan.productionAcceptanceAllowed, false);
assert.equal(plan.priorPilot.physicalCardSessionsPerIdentity, 1);
assert.equal(plan.priorPilot.modelSelectionAndProtectedTestSeparated, false);
assert.equal(plan.captureRequirement.requiredNewIndependentSessionsPerIdentity, 1);
assert.equal(plan.captureRequirement.requiredNewPhysicalCardSessions, 6);
assert.equal(plan.identities.length, 6);
assert.equal(new Set(plan.identities.map((identity: { newPhysicalCardSessionId: string }) => identity.newPhysicalCardSessionId)).size, 6);

const modelSelectionSessions = plan.identities.map((identity: {
  modelSelectionPhysicalCardSessionId: string;
}) => identity.modelSelectionPhysicalCardSessionId);
const protectedTestSessions = plan.identities.map((identity: {
  newPhysicalCardSessionId: string;
}) => identity.newPhysicalCardSessionId);
assert.deepEqual(plan.consentRoleUpdate.modelSelectionPhysicalCardSessions, modelSelectionSessions);
assert.deepEqual(plan.consentRoleUpdate.protectedTestPhysicalCardSessions, protectedTestSessions);
const originalSessionEvidence = readFileSync(path.join(root, plan.sourceIdentityEvidence.originalSessionPath), 'utf8');
for (const session of modelSelectionSessions) {
  assert.ok(
    originalSessionEvidence.includes(`sourceRelativePath: '${session}/`),
    `Original session is not pinned by approved-capture evidence: ${session}`,
  );
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

const syntheticRoot = mkdtempSync(path.join(tmpdir(), 'stackr-six-card-protected-'));
try {
  const columns = [
    'language', 'physical_card_session_id', 'source_folder', 'file_name', 'relative_path',
    'width', 'height', 'bytes', 'sha256', 'source_kind', 'image_rights_status',
    'review_status', 'label_verification_status', 'card_side', 'set_code',
    'collector_number', 'variant', 'finish', 'expected_card_name', 'lighting_category',
    'sleeve_state', 'holder_state', 'notes',
  ];
  const rows: Record<string, string>[] = [];
  for (const identity of plan.identities as Array<{
    language: string;
    setCode: string;
    collectorNumber: string;
    variant: string;
    finish: string;
    cardName: string;
    modelSelectionPhysicalCardSessionId: string;
    newPhysicalCardSessionId: string;
  }>) {
    for (const [role, session] of [
      ['model-selection', identity.modelSelectionPhysicalCardSessionId],
      ['protected-test', identity.newPhysicalCardSessionId],
    ] as const) {
      const fileName = `${role}.jpg`;
      const relativePath = `${session}/${fileName}`;
      mkdirSync(path.join(syntheticRoot, session), { recursive: true });
      writeFileSync(path.join(syntheticRoot, relativePath), 'synthetic fixture; hash verification intentionally disabled');
      rows.push({
        language: identity.language,
        physical_card_session_id: session,
        source_folder: session,
        file_name: fileName,
        relative_path: relativePath,
        width: '540',
        height: '720',
        bytes: '55',
        sha256: createHash('sha256').update(relativePath).digest('hex'),
        source_kind: 'real_capture',
        image_rights_status: 'user_consent',
        review_status: 'confirmed',
        label_verification_status: 'reviewed',
        card_side: 'front',
        set_code: identity.setCode,
        collector_number: identity.collectorNumber,
        variant: identity.variant,
        finish: identity.finish,
        expected_card_name: identity.cardName,
        lighting_category: 'fixture',
        sleeve_state: 'unknown',
        holder_state: 'none',
        notes: 'six-card protected-split fixture',
      });
    }
  }
  writeFileSync(
    path.join(syntheticRoot, 'capture-review-manifest.csv'),
    `${columns.map(csvCell).join(',')}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
  );
  writeFileSync(path.join(syntheticRoot, 'capture-consent-evidence.json'), JSON.stringify({
    schemaVersion: 'stackr-stage6-capture-consent-v1.2.0',
    scope: 'private_model_evaluation_and_training',
    ownerStatement: 'Synthetic fixture only.',
    reviewedPhysicalCardSessions: [...modelSelectionSessions, ...protectedTestSessions],
    modelSelectionPhysicalCardSessions: modelSelectionSessions,
    protectedTestPhysicalCardSessions: protectedTestSessions,
    productionPublicationApproved: false,
  }));
  const syntheticManifest = buildReviewedCaptureEvaluationManifest({
    root: syntheticRoot,
    verifyHashes: false,
    generatedAt: '2026-08-31T00:00:00.000Z',
  });
  assert.equal(syntheticManifest.summary.identityClasses, 6);
  assert.equal(syntheticManifest.summary.physicalCardSessions, 12);
  assert.equal(syntheticManifest.summary.modelSelectionPhysicalCardSessions, 6);
  assert.equal(syntheticManifest.summary.protectedTestPhysicalCardSessions, 6);
  assert.equal(syntheticManifest.summary.protectedTestEligible, true);
  assert.equal(syntheticManifest.evaluationPolicy.modelSelectionAndProtectedTestSeparated, true);
  assert.equal(syntheticManifest.evaluationPolicy.productionAcceptanceAllowed, false);
} finally {
  rmSync(syntheticRoot, { recursive: true, force: true });
}

console.log('Recognition tomorrow-prep evidence checks passed.');
