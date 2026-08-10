import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type GateStatus = 'pass' | 'fail' | 'insufficient_data' | 'not_applicable';
type Gate = {
  key: string;
  status: GateStatus;
  target: string;
  actual: string;
  evidence: string[];
};

async function main() {
  const goldSet = JSON.parse(await readFile('data/quality/gold-test-set.template.json', 'utf8')) as {
    cases?: unknown[];
    status?: string;
  };
  const qualityObservations = JSON.parse(await readFile('data/quality/quality-observations.template.json', 'utf8')) as {
    observations?: unknown[];
    performance?: unknown[];
  };

  const gates: Gate[] = [
  {
    key: 'catalogue_coverage_parity',
    status: 'insufficient_data',
    target: 'Canonical Stackr coverage is at least equal to the legacy launch scope.',
    actual: 'No activated canonical catalogue version or parity report is available.',
    evidence: ['docs/stackr-api/data-coverage-audit.md'],
  },
  {
    key: 'required_language_regression',
    status: 'fail',
    target: 'No critical English, Japanese, Simplified Chinese, Traditional Chinese or Korean regression.',
    actual: 'The audit found zero live Simplified Chinese, Traditional Chinese and Korean canonical coverage.',
    evidence: ['docs/stackr-api/data-coverage-audit.md'],
  },
  {
    key: 'scan_benchmark',
    status: 'insufficient_data',
    target: 'Recognition release gates pass on leakage-safe real captures.',
    actual: `Gold cases: ${goldSet.cases?.length ?? 0}; observations: ${qualityObservations.observations?.length ?? 0}.`,
    evidence: ['data/quality/gold-test-set.template.json', 'data/quality/quality-observations.template.json'],
  },
  {
    key: 'api_latency',
    status: 'insufficient_data',
    target: 'All Stage 12 catalogue, search and recognition p95 gates pass in staging.',
    actual: `Performance observations: ${qualityObservations.performance?.length ?? 0}.`,
    evidence: ['docs/stackr-api/quality-performance-observability.md'],
  },
  {
    key: 'price_provenance',
    status: 'fail',
    target: 'Every card and product price uses canonical identity and provider-neutral provenance.',
    actual: 'Card pricing has a Stackr API adapter, but sealed/accessory product pricing still uses the legacy eBay backend route.',
    evidence: ['lib/stackrDomainAdapter.ts', 'lib/productSearch.ts'],
  },
  {
    key: 'user_collection_reconciliation',
    status: 'insufficient_data',
    target: 'All existing collection identities reconcile or enter quarantine without incorrect attachment.',
    actual: 'The reversible mapping ledger exists locally; no production or staging reconciliation run has been executed.',
    evidence: ['supabase/migrations/20260728202949_stackr_application_migration_provider_retirement.sql'],
  },
  {
    key: 'rollback_validation',
    status: 'insufficient_data',
    target: 'Catalogue, cache, gateway, recognition, model, index and feature-flag rollback are tested in staging.',
    actual: 'The local legacy-cache rollback is automated; full staging rollback has not been run.',
    evidence: ['scripts/test-stackr-application-migration.ts', 'deploy/rollback-runbook.md'],
  },
  {
    key: 'provider_dependency_retirement',
    status: 'fail',
    target: 'No routine client catalogue, recognition or pricing provider calls remain.',
    actual: 'Legacy product pricing, grading, feedback and quarantined compatibility paths remain. The home summary and binder completion tracker intentionally retain their original catalogue calculations pending visual and data-parity sign-off.',
    evidence: ['lib/productSearch.ts', 'lib/ximilar.ts', 'lib/recognitionFeedbackLoop.ts', 'lib/cardSearch.ts', 'lib/collectionSummary.ts', 'app/(tabs)/binder.tsx'],
  },
  {
    key: 'visual_uat_parity',
    status: 'insufficient_data',
    target: 'Existing Stackr UI and populated screen states pass device UAT.',
    actual: 'API flag-off compatibility and the exact home/binder collection-tracker calculations were restored after a reported content regression; device screenshot parity has not yet been signed off.',
    evidence: ['lib/stackrDomainAdapter.ts', 'lib/collectionSummary.ts', 'app/(tabs)/binder.tsx'],
  },
  {
    key: 'provider_credentials_removed',
    status: 'not_applicable',
    target: 'Unused credentials are removed only after all provider retirement gates pass.',
    actual: 'Credentials must remain server-side while emergency and unresolved legacy fallbacks remain enabled.',
    evidence: ['docs/stackr-api/environment-variable-inventory.md'],
  },
  ];

  const recommendation = gates.every((gate) => gate.status === 'pass' || gate.status === 'not_applicable')
    ? 'GO'
    : 'NO_GO';
  const report = {
    schemaVersion: 'stackr-provider-retirement-evaluation-v1.0.0',
    generatedAt: new Date().toISOString(),
    stage: 14,
    recommendation,
    releaseAllowed: recommendation === 'GO',
    gates,
    failedGateKeys: gates.filter((gate) => gate.status === 'fail').map((gate) => gate.key),
    insufficientGateKeys: gates.filter((gate) => gate.status === 'insufficient_data').map((gate) => gate.key),
    providerAction: 'Keep Ximilar and all unresolved legacy providers behind server-side feature flags. Do not retire credentials.',
  };

  const output = path.resolve('data/quality/provider-retirement-gates.stage14.json');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`provider retirement recommendation: ${recommendation}`);
  console.log(`report: ${path.relative(process.cwd(), output)}`);
  if (process.argv.includes('--fail-on-no-go') && recommendation !== 'GO') process.exitCode = 1;
}

void main();
