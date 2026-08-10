import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const manifestPath = 'ml/data_manifests/pilot-dataset.parquet';
const hardNegativePath = 'ml/data_manifests/hard-negative-groups.json';
const reportPath = 'ml/reports/pilot-dataset-report.html';

for (const filePath of [manifestPath, hardNegativePath, reportPath]) {
  assert.ok(existsSync(filePath), `${filePath} should exist`);
  assert.ok(statSync(filePath).size > 0, `${filePath} should not be empty`);
}

const parquet = readFileSync(manifestPath);
assert.equal(parquet.subarray(0, 4).toString('utf8'), 'PAR1', 'Parquet manifest should start with PAR1');
assert.equal(parquet.subarray(parquet.length - 4).toString('utf8'), 'PAR1', 'Parquet manifest should end with PAR1');
const footerLength = parquet.readInt32LE(parquet.length - 8);
assert.ok(footerLength > 0, 'Parquet footer should have metadata');
assert.ok(footerLength < parquet.length - 8, 'Parquet footer length should fit within file');

const hardNegativePayload = JSON.parse(readFileSync(hardNegativePath, 'utf8')) as {
  summary: {
    rowCount: number;
    classCount: number;
    sourceImageCount: number;
    syntheticViewRowCount: number;
    realPhoneCaptureSourceCount: number;
    realPhoneTestSourceCount: number;
    duplicateAnalysis: { sourceLeakageExists: boolean };
    limitations: string[];
  };
  groups: Array<{
    type: string;
    status: string;
    members: Array<{
      cardId: string;
      cardName: string;
      setId: string;
    }>;
  }>;
};

assert.ok(hardNegativePayload.summary.rowCount > 0, 'Expected dataset rows');
assert.ok(hardNegativePayload.summary.classCount > 0, 'Expected classes');
assert.ok(hardNegativePayload.summary.sourceImageCount > 0, 'Expected source references');
assert.ok(
  hardNegativePayload.summary.syntheticViewRowCount > hardNegativePayload.summary.sourceImageCount,
  'Expected controlled synthetic views for each source'
);
assert.equal(
  hardNegativePayload.summary.duplicateAnalysis.sourceLeakageExists,
  false,
  'No source-image leakage should exist between splits'
);
assert.equal(
  (hardNegativePayload.summary.duplicateAnalysis as any).physicalCardSessionLeakageExists,
  false,
  'No physical-card session leakage should exist between splits'
);
assert.ok(
  hardNegativePayload.summary.realPhoneCaptureSourceCount > 0 ||
    hardNegativePayload.summary.limitations.some((item) => item.includes('No approved real Stackr phone-capture export')),
  'Missing real phone captures should be recorded when no Scan Lab export exists'
);
assert.ok(
  hardNegativePayload.summary.realPhoneCaptureSourceCount === 0 ||
    hardNegativePayload.summary.realPhoneTestSourceCount > 0,
  'The test split should contain real phone captures when reviewed captures are available'
);
assert.ok(
  hardNegativePayload.summary.limitations.some((item) => item.includes('synthetic-heavy')),
  'Synthetic-heavy limitation should be recorded'
);

const requiredHardNegativeTypes = [
  'same_pokemon_different_artwork',
  'identical_artwork_different_set',
  'identical_artwork_different_language',
  'standard_versus_reverse_holo',
  'stamped_versus_unstamped',
  'first_edition_versus_unlimited',
  'promo_versus_set_release',
  'same_collector_number_different_set',
  'similar_full_art_layouts',
  'poke_ball_versus_master_ball_patterns',
];
for (const type of requiredHardNegativeTypes) {
  assert.ok(
    hardNegativePayload.groups.some((group) => group.type === type),
    `Expected hard-negative group type ${type}`
  );
}
assert.ok(
  hardNegativePayload.groups.some((group) => group.status === 'represented' && group.members.length >= 2),
  'Expected at least one represented hard-negative group'
);
const identicalArtworkGroup = hardNegativePayload.groups.find((group) => group.type === 'identical_artwork_different_set');
assert.ok(identicalArtworkGroup, 'Expected identical-artwork hard-negative group');
assert.deepEqual(
  identicalArtworkGroup.members.map((member) => member.cardId).sort(),
  ['base1-4', 'base4-4'],
  'Base/Base Set 2 same-art group should use the verified Charizard reprint pair'
);
assert.ok(
  identicalArtworkGroup.members.every((member) => member.cardName === 'Charizard'),
  'Identical-artwork Charizard group should not include unrelated cards'
);

const report = readFileSync(reportPath, 'utf8');
assert.ok(report.includes('Example Augmentation Grids'), 'Report should show augmentation grids');
assert.ok(report.includes('Provenance Exclusions'), 'Report should show provenance exclusions');
assert.ok(report.includes('Real Versus Synthetic'), 'Report should show real versus synthetic distribution');
assert.ok(report.includes('Source Rights Distribution'), 'Report should show source rights distribution');
assert.ok(report.includes('pilot-dataset-summary'), 'Report should embed machine-readable summary');

const tempDir = mkdtempSync(path.join(tmpdir(), 'stackr-pilot-dataset-'));
try {
  const scanLabManifestPath = path.join(tempDir, 'scan-lab-reviewed-training-manifest.json');
  const tempHardNegatives = path.join(tempDir, 'hard-negative-groups.json');
  const tempDataset = path.join(tempDir, 'pilot-dataset.parquet');
  const tempReport = path.join(tempDir, 'pilot-dataset-report.html');
  const scanLabManifest = {
    manifestVersion: 'stackr-scan-lab-training-manifest-v1.0.0',
    sourceSchemaVersion: 'stackr-scan-lab-v1.0.0',
    generatedAt: '2026-07-27T12:00:00.000Z',
    examples: [
      {
        id: 'scanlab_fixture_a',
        physicalCardSessionId: 'physical_fixture_same_card',
        split: 'train',
        capturedAt: '2026-07-27T12:00:00.000Z',
        reviewStatus: 'confirmed',
        labelVerificationStatus: 'reviewed',
        originalPhotoStoragePath: 'tester/scanlab_fixture_a/original-photo.jpg',
        rectifiedCardStoragePath: 'tester/scanlab_fixture_a/rectified-card.png',
        originalPhotoChecksumSha256: 'a'.repeat(64),
        rectifiedCardChecksumSha256: 'b'.repeat(64),
        expectedIdentity: { stackrCardId: 'sv1-025', cardName: 'Pikachu', setId: 'sv1', language: 'en', variant: 'standard' },
        userConfirmedIdentity: { stackrCardId: 'sv1-025', cardName: 'Pikachu', setId: 'sv1', language: 'en', variant: 'standard' },
        deviceInfo: { platform: 'ios', deviceModel: 'iPhone' },
        lightingCategory: 'daylight',
        sleeveState: 'none',
        holderState: 'none',
        cardSide: 'front',
      },
      {
        id: 'scanlab_fixture_b',
        physicalCardSessionId: 'physical_fixture_same_card',
        split: 'train',
        capturedAt: '2026-07-27T12:01:00.000Z',
        reviewStatus: 'confirmed',
        labelVerificationStatus: 'verified',
        originalPhotoStoragePath: 'tester/scanlab_fixture_b/original-photo.jpg',
        rectifiedCardStoragePath: 'tester/scanlab_fixture_b/rectified-card.png',
        originalPhotoChecksumSha256: 'c'.repeat(64),
        rectifiedCardChecksumSha256: 'd'.repeat(64),
        expectedIdentity: { stackrCardId: 'sv1-025', cardName: 'Pikachu', setId: 'sv1', language: 'en', variant: 'standard' },
        userConfirmedIdentity: { stackrCardId: 'sv1-025', cardName: 'Pikachu', setId: 'sv1', language: 'en', variant: 'standard' },
        deviceInfo: { platform: 'android', deviceModel: 'Pixel' },
        lightingCategory: 'bright_indoor',
        sleeveState: 'sleeved',
        holderState: 'none',
        cardSide: 'front',
      },
    ],
    rejectedRows: [],
    leakageChecks: {
      physicalCardSessionLeakage: false,
      leakedPhysicalCardSessionIds: [],
    },
    limitations: [],
  };
  writeFileSync(scanLabManifestPath, `${JSON.stringify(scanLabManifest, null, 2)}\n`, 'utf8');
  const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  execFileSync(process.execPath, [tsxCli, 'scripts/build-pilot-recognition-dataset.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      STACKR_PILOT_SCAN_LAB_MANIFEST: scanLabManifestPath,
      STACKR_PROVIDER_PROBES_PATH: 'scripts/fixtures/provider-image-probes.empty.json',
      STACKR_PILOT_OUT_MANIFEST: tempDataset,
      STACKR_PILOT_OUT_HARD_NEGATIVES: tempHardNegatives,
      STACKR_PILOT_OUT_REPORT: tempReport,
    },
  });
  const tempPayload = JSON.parse(readFileSync(tempHardNegatives, 'utf8'));
  assert.equal(tempPayload.summary.realPhoneCaptureSourceCount, 2);
  assert.equal(tempPayload.summary.approvedTrainingPixelSourceCount, 2);
  assert.equal(tempPayload.summary.realPhoneTestSourceCount, 2);
  assert.equal(tempPayload.summary.duplicateAnalysis.physicalCardSessionLeakageExists, false);
  assert.equal(tempPayload.summary.sourceRightsDistribution.some((row: any) => row.key === 'user_consent' && row.count === 2), true);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log('pilot recognition dataset checks passed');
