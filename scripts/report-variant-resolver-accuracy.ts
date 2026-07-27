import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  EXACT_VARIANT_RESOLVER_VERSION,
  getVariantFamilyRegister,
  resolveExactVariant,
  type VariantResolutionInput,
} from '../lib/recognition/variantResolver';

const VALIDATION_PATH = 'ml/data_manifests/variant-resolver-validation.jsonl';
const REPORT_JSON_PATH = 'ml/reports/variant-resolver-accuracy.json';
const REPORT_HTML_PATH = 'ml/reports/variant-resolver-accuracy.html';

type ValidationRow = VariantResolutionInput & {
  expectedVariantId: string;
  group: string;
};

function sha256File(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readRows(): ValidationRow[] {
  if (!existsSync(VALIDATION_PATH)) return [];
  return readFileSync(VALIDATION_PATH, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ValidationRow);
}

function writeBlockedReport() {
  const register = getVariantFamilyRegister();
  const report = {
    status: 'blocked',
    generatedAt: new Date().toISOString(),
    resolverVersion: EXACT_VARIANT_RESOLVER_VERSION,
    familyRegisterVersion: register.version,
    validationRows: 0,
    metrics: {
      exactVariantAccuracy: null,
      unresolvedRate: null,
      falseExactVariantRate: null,
      byGroup: {
        standard_vs_reverse_holo: null,
        pokeball_vs_masterball: null,
        stamped_vs_unstamped: null,
        first_edition_vs_unlimited: null,
        same_art_promotional_release: null,
        japanese_vs_english_same_artwork: null,
        texture_vs_non_texture: null,
      },
    },
    blockers: [
      'missing ml/data_manifests/variant-resolver-validation.jsonl',
      'no_reviewed_variant_validation_rows',
      'variant_accuracy_not_measured',
    ],
    exitCriteria: {
      baseIdentityAndExactVariantReportedSeparately: true,
      unresolvedFinishDoesNotBecomeFalseExactMatch: true,
      variantAccuracyMeasuredIndependently: false,
    },
  };
  writeFileSync(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(REPORT_HTML_PATH, `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Variant Resolver Accuracy</title></head>
<body>
  <h1>Variant Resolver Accuracy</h1>
  <p>Status: <strong>blocked</strong></p>
  <p>No reviewed variant validation rows were found at <code>${VALIDATION_PATH}</code>.</p>
  <p>Exact variant accuracy is not measured yet.</p>
</body>
</html>
`);
  console.log(JSON.stringify({ ok: true, status: 'blocked', reportJson: REPORT_JSON_PATH }, null, 2));
}

function writeReadyReport(rows: ValidationRow[]) {
  const results = rows.map((row) => ({
    row,
    result: resolveExactVariant(row),
  }));
  const resolved = results.filter((entry) => entry.result.outcome === 'resolved_variant');
  const correctResolved = resolved.filter((entry) => entry.result.exactVariant?.variantId === entry.row.expectedVariantId);
  const falseResolved = resolved.length - correctResolved.length;
  const byGroup: Record<string, { exactVariantAccuracy: number | null; unresolvedRate: number; count: number }> = {};
  for (const group of [...new Set(rows.map((row) => row.group))]) {
    const groupResults = results.filter((entry) => entry.row.group === group);
    const groupResolved = groupResults.filter((entry) => entry.result.outcome === 'resolved_variant');
    const groupCorrect = groupResolved.filter((entry) => entry.result.exactVariant?.variantId === entry.row.expectedVariantId);
    byGroup[group] = {
      exactVariantAccuracy: groupResolved.length ? groupCorrect.length / groupResolved.length : null,
      unresolvedRate: groupResults.filter((entry) => entry.result.outcome === 'unresolved_variant').length / groupResults.length,
      count: groupResults.length,
    };
  }

  const report = {
    status: 'ready',
    generatedAt: new Date().toISOString(),
    resolverVersion: EXACT_VARIANT_RESOLVER_VERSION,
    validationDatasetSha256: sha256File(VALIDATION_PATH),
    validationRows: rows.length,
    metrics: {
      exactVariantAccuracy: resolved.length ? correctResolved.length / resolved.length : null,
      unresolvedRate: results.filter((entry) => entry.result.outcome === 'unresolved_variant').length / results.length,
      falseExactVariantRate: resolved.length ? falseResolved / resolved.length : null,
      byGroup,
    },
    blockers: [],
    exitCriteria: {
      baseIdentityAndExactVariantReportedSeparately: true,
      unresolvedFinishDoesNotBecomeFalseExactMatch: falseResolved === 0,
      variantAccuracyMeasuredIndependently: true,
    },
  };
  writeFileSync(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(REPORT_HTML_PATH, `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Variant Resolver Accuracy</title></head>
<body>
  <h1>Variant Resolver Accuracy</h1>
  <p>Status: <strong>ready</strong></p>
  <pre>${JSON.stringify(report.metrics, null, 2)}</pre>
</body>
</html>
`);
  console.log(JSON.stringify({ ok: true, status: 'ready', reportJson: REPORT_JSON_PATH }, null, 2));
}

mkdirSync('ml/reports', { recursive: true });
const rows = readRows();
if (rows.length === 0) {
  writeBlockedReport();
} else {
  writeReadyReport(rows);
}
