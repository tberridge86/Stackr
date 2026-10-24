import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ARCHITECTURE_CHECKS = Object.freeze([
  ['dependencies', 'Locked dependencies'],
  ['r2_storage', 'Immutable R2 uploads, migration safeguards and legacy delivery'],
  ['api_delivery', 'Actual v1 card, manifest and fast set projection'],
  ['pagination', 'Bounded client/ownership pages and complete catalogue windows'],
  ['owned_facts', 'Ownership facts independent of optional artwork'],
  ['legacy_repair', 'Legacy original preservation and R2 derivative repair'],
  ['web_images', 'Web image loading and fallback'],
  ['worker_boundary', 'Railway worker activation and scheduler boundary'],
  ['report_contract', 'Validation evidence failure handling'],
  ['migration_image', 'Isolated migration image and pinned database certificate'],
  ['pages_release', 'Exact-source Pages build and publication boundaries'],
]);

export function architectureValidationReport({ sourceSha, steps = {}, runUrl = null }) {
  if (!/^[a-f0-9]{40}$/i.test(sourceSha ?? '')) throw new Error('A full tested source commit is required.');
  const checks = ARCHITECTURE_CHECKS.map(([id, name]) => {
    const outcome = steps[id]?.outcome ?? 'not_run';
    return { id, name, outcome, passed: outcome === 'success' };
  });
  return {
    schemaVersion: 1,
    sourceSha,
    runUrl,
    scope: 'offline_architecture_regressions',
    status: checks.every((check) => check.passed) ? 'passed' : 'blocked',
    checks,
    liveValidation: {
      r2Service: 'not_run',
      cdnDomain: 'not_run',
      deployedAppDelivery: 'not_run',
      deviceRendering: 'not_run',
      retrievalLatency: 'not_measured',
    },
    deploymentApproved: false,
  };
}

async function main() {
  const report = architectureValidationReport({
    sourceSha: process.env.ARCHITECTURE_SOURCE_SHA,
    steps: JSON.parse(process.env.ARCHITECTURE_STEPS_JSON ?? '{}'),
    runUrl: process.env.ARCHITECTURE_RUN_URL || null,
  });
  const output = path.resolve('reports/distributed-architecture-validation.json');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  const summary = [
    `### Architecture checks: ${report.status}`,
    '',
    `Tested source: \`${report.sourceSha}\``,
    '',
    '| Check | Outcome |',
    '| --- | --- |',
    ...report.checks.map((check) => `| ${check.name} | ${check.outcome} |`),
    '',
    'Offline fixtures do not establish live CDN delivery, device behavior, latency or deployment approval.',
    '',
  ].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary);
  if (report.status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
