import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const TCGDEX_JAPANESE_SET_GREEN_DECISION_PATH =
  'catalogue/rights-reviews/tcgdex-japanese-set-english-display-green.2026-09-04.json';

type JsonRecord = Record<string, any>;

const sha256 = (body: string | Buffer) => createHash('sha256').update(body).digest('hex');

function readBoundFile(path: unknown, expectedSha256: unknown, label: string) {
  const relativePath = String(path ?? '');
  const expected = String(expectedSha256 ?? '');
  if (!relativePath || !/^[a-f0-9]{64}$/.test(expected)) throw new Error(`Invalid ${label} binding.`);
  const body = readFileSync(resolve(relativePath));
  if (sha256(body) !== expected) throw new Error(`${label} binding SHA-256 mismatch.`);
  return { relativePath, body, json: relativePath.endsWith('.json') ? JSON.parse(body.toString('utf8')) as JsonRecord : null };
}

export function readTcgdexJapaneseSetGreenGate() {
  const decisionBody = readFileSync(resolve(TCGDEX_JAPANESE_SET_GREEN_DECISION_PATH));
  const decision = JSON.parse(decisionBody.toString('utf8')) as JsonRecord;
  if (decision.schemaVersion !== 'stackr-green-metadata-activation-decision-v1'
    || decision.decisionId !== 'tcgdex-japanese-set-english-display-green:2026-09-04'
    || decision.classification !== 'green'
    || decision.status !== 'authorized_under_internal_operating_boundary'
    || decision.activationAuthorized !== true
    || decision.publicRuntimeImportAuthorized !== true
    || decision.canonicalDatabaseWriteAuthorized !== false
    || decision.signature !== null
    || decision.signatureRequired !== false) {
    throw new Error('TCGdex Japanese set display decision is not the expected bounded green record.');
  }

  const scope = decision.scope as JsonRecord;
  if (scope?.sourceCode !== 'tcgdex'
    || scope?.repository !== 'tcgdex/cards-database'
    || scope?.pinnedCommit !== 'dd4fc9460b54b91c25df750c68ca36b9946448e2'
    || scope?.language !== 'ja'
    || scope?.field !== 'set_english_display_supplement'
    || !Array.isArray(scope?.excludedUses)
    || !['canonical_database_write', 'artwork', 'set_logo', 'expansion_symbol', 'model_training']
      .every((use) => scope.excludedUses.includes(use))) {
    throw new Error('TCGdex Japanese set display decision has unsafe scope.');
  }

  const controls = decision.runtimeControls as JsonRecord;
  if (controls?.exactJapaneseSetCodeRequired !== true
    || controls?.nativeNameRemainsPrimary !== true
    || controls?.englishLabelRequired !== true
    || controls?.manualReviewedMapKeepsPrecedence !== true
    || controls?.failClosedOnBindingMismatch !== true
    || controls?.killSwitchValue !== 'true'
    || !Array.isArray(controls?.sourceKillSwitches)
    || !controls.sourceKillSwitches.includes('EXPO_PUBLIC_DISABLE_TCGDEX_METADATA')
    || !controls.sourceKillSwitches.includes('STACKR_DISABLE_TCGDEX_METADATA')) {
    throw new Error('TCGdex Japanese set display decision lacks required runtime controls.');
  }

  const bindings = decision.bindings as JsonRecord;
  const boundary = readBoundFile(bindings?.operatingBoundaryPath, bindings?.operatingBoundarySha256, 'operating boundary');
  if (!boundary.body.toString('utf8').includes('Use TCGdex catalogue metadata under its published MIT database licence')) {
    throw new Error('Operating boundary no longer contains the TCGdex green metadata authority.');
  }
  const compatibility = readBoundFile(
    bindings?.boundaryCompatibilityReviewPath,
    bindings?.boundaryCompatibilityReviewSha256,
    'boundary compatibility review',
  ).json!;
  if (compatibility.classification !== 'green_binding_reconfirmation'
    || compatibility.authority?.sha256 !== bindings.operatingBoundarySha256
    || compatibility.limits?.activatesAmberUses !== false
    || compatibility.limits?.activatesRedUses !== false
    || !Array.isArray(compatibility.reconfirmedGreenDecisions)
    || !compatibility.reconfirmedGreenDecisions.includes(decision.decisionId)) {
    throw new Error('Current operating-boundary compatibility has not been safely recorded.');
  }
  const registry = readBoundFile(bindings?.rightsRegistryPath, bindings?.rightsRegistrySha256, 'rights registry').json!;
  const tcgdex = Array.isArray(registry.sources)
    ? registry.sources.find((source: JsonRecord) => source?.code === 'tcgdex')
    : null;
  if (!tcgdex
    || tcgdex.active !== true
    || tcgdex.termsUrl !== 'https://tcgdex.dev/'
    || tcgdex.capabilities?.metadataDiscovery !== 'approved'
    || tcgdex.capabilities?.automatedMetadataFetch !== 'approved'
    || tcgdex.capabilities?.automatedAssetFetch !== 'conditional'
    || tcgdex.capabilities?.persistOriginalAsset !== 'conditional'
    || tcgdex.capabilities?.publicDisplay !== 'conditional'
    || tcgdex.capabilities?.createDerivatives !== 'conditional'
    || tcgdex.capabilities?.createEmbeddings !== 'conditional'
    || tcgdex.capabilities?.trainModels !== 'review_required') {
    throw new Error('TCGdex registry posture does not match the operating boundary.');
  }

  const evidence = readBoundFile(bindings?.evidencePath, bindings?.evidenceSha256, 'TCGdex evidence').json!;
  if (evidence.sourceCode !== 'tcgdex'
    || evidence.pinnedCommitSha !== scope.pinnedCommit
    || evidence.legalStatus !== 'internally_authorized_green_metadata_only'
    || evidence.scopeAssessment?.metadataDiscovery !== 'approved'
    || evidence.scopeAssessment?.automatedMetadataFetch !== 'approved'
    || evidence.scopeAssessment?.japaneseSetEnglishDisplaySupplement !== 'approved_green_native_primary_display_only') {
    throw new Error('TCGdex evidence does not authorize the bounded metadata display lane.');
  }
  const expectedEvidenceRef = `file:${bindings.evidencePath}#sha256=${bindings.evidenceSha256}`;
  if (tcgdex.permissionEvidenceRef !== expectedEvidenceRef) {
    throw new Error('TCGdex registry does not bind the reviewed metadata evidence.');
  }

  const frozen = readBoundFile(bindings?.frozenSourcePath, bindings?.frozenSourceSha256, 'frozen Japanese set source').json!;
  if (frozen.source?.repository !== scope.repository
    || frozen.source?.pinnedCommit !== scope.pinnedCommit
    || frozen.source?.sha256 !== '8420715261c1a3b2237c822294e7ea3fe8e544ad970c8c0d60612752967957f5'
    || frozen.source?.licence !== 'MIT'
    || frozen.policy?.nativeNameRemainsPrimary !== true
    || frozen.policy?.canonicalDatabaseWriteAuthorized !== false) {
    throw new Error('Frozen Japanese set source is outside the green decision.');
  }

  const notice = readBoundFile(bindings?.thirdPartyNoticePath, bindings?.thirdPartyNoticeSha256, 'third-party notice');
  const noticeText = notice.body.toString('utf8');
  if (!noticeText.includes('Copyright (c) 2021 TCGdex') || !noticeText.includes('MIT License')) {
    throw new Error('TCGdex third-party notice is incomplete.');
  }

  return {
    decisionPath: TCGDEX_JAPANESE_SET_GREEN_DECISION_PATH,
    decisionSha256: sha256(decisionBody),
    decisionId: String(decision.decisionId),
    classification: 'green' as const,
    activationAuthorized: true as const,
    publicRuntimeImportAuthorized: true as const,
    canonicalDatabaseWriteAuthorized: false as const,
    sourceKillSwitches: [...controls.sourceKillSwitches] as string[],
  };
}
