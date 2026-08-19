#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function option(name, fallback = '') {
  const prefix = `--${name}=`;
  const entry = process.argv.find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function command(label, args, options = {}) {
  return {
    label,
    command: npmCommand,
    args,
    cwd: options.cwd ?? process.cwd(),
    required: options.required !== false,
    category: options.category ?? 'core',
  };
}

const scope = option('scope', 'full');
if (!['core', 'full'].includes(scope)) {
  console.error('--scope must be core or full');
  process.exit(2);
}

const outputPath = path.resolve(option('output', 'reports/backend/readiness.json'));
const maxLogCharacters = Number(option('maxLogCharacters', '6000'));
const startedAt = new Date();

const checks = [
  command('Root application typecheck', ['run', 'typecheck'], { category: 'compile' }),
  command('Backend typecheck', ['run', 'typecheck:backend'], { category: 'compile' }),
  command('Backend HTTP and unit tests', ['test', '--prefix', 'backend'], { category: 'api' }),
  command('API contract consistency', ['run', 'check:api-contract'], { category: 'api' }),
  command('StackR API v1 contract tests', ['run', 'test:stackr-api-v1'], { category: 'api' }),
  command('Seller stock-out routing', ['run', 'test:seller-stock-out-routing'], { category: 'commerce' }),
  command('Premium Seller access controls', ['run', 'test:premium-seller-access'], { category: 'commerce' }),
  command('Catalogue asset pipeline', ['run', 'test:asset-pipeline'], { category: 'catalogue' }),
  command('Catalogue schema', ['run', 'test:catalogue-schema'], { category: 'catalogue' }),
  command('Catalogue ingestion', ['run', 'test:catalogue-ingestion'], { category: 'catalogue' }),
  command('Pokemon TCG API mirror adapter', ['exec', '--', 'tsx', 'scripts/test-pokemon-tcg-api-adapter.ts'], { category: 'catalogue' }),
  command('Master catalogue importer', ['run', 'test:master-catalogue-importer'], { category: 'catalogue' }),
  command('Recognition orchestrator', ['run', 'test:recognition-orchestrator'], { category: 'recognition' }),
  command('Gateway tests', ['test', '--prefix', 'gateway'], { category: 'gateway' }),
];

const selectedChecks = scope === 'core'
  ? checks.filter((check) => ['compile', 'api', 'commerce', 'catalogue'].includes(check.category))
  : checks;

function tail(value) {
  const text = String(value ?? '').trim();
  if (text.length <= maxLogCharacters) return text;
  return `[truncated ${text.length - maxLogCharacters} characters]\n${text.slice(-maxLogCharacters)}`;
}

const results = [];
for (const check of selectedChecks) {
  const checkStartedAt = Date.now();
  const result = spawnSync(check.command, check.args, {
    cwd: check.cwd,
    env: {
      ...process.env,
      CI: process.env.CI ?? 'true',
      FORCE_COLOR: '0',
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20 * 60 * 1000,
  });

  const exitCode = typeof result.status === 'number' ? result.status : 1;
  results.push({
    label: check.label,
    category: check.category,
    required: check.required,
    passed: exitCode === 0 && !result.error,
    exitCode,
    durationMs: Date.now() - checkStartedAt,
    command: [check.command, ...check.args].join(' '),
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr || result.error?.message),
  });
}

const requiredChecks = results.filter((result) => result.required);
const passedRequired = requiredChecks.filter((result) => result.passed).length;
const failedRequired = requiredChecks.length - passedRequired;
const categorySummary = Object.fromEntries(
  [...new Set(results.map((result) => result.category))].map((category) => {
    const categoryResults = results.filter((result) => result.category === category);
    return [category, {
      passed: categoryResults.filter((result) => result.passed).length,
      failed: categoryResults.filter((result) => !result.passed).length,
      total: categoryResults.length,
    }];
  }),
);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  startedAt: startedAt.toISOString(),
  durationMs: Date.now() - startedAt.getTime(),
  scope,
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    commitSha: process.env.GITHUB_SHA ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    branch: process.env.GITHUB_REF_NAME ?? process.env.RAILWAY_GIT_BRANCH ?? null,
    workflowRunId: process.env.GITHUB_RUN_ID ?? null,
    workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  },
  summary: {
    ready: failedRequired === 0,
    passedRequired,
    failedRequired,
    totalRequired: requiredChecks.length,
    scorePercent: requiredChecks.length
      ? Number(((passedRequired / requiredChecks.length) * 100).toFixed(1))
      : 0,
    categories: categorySummary,
  },
  checks: results,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ready: report.summary.ready,
  scorePercent: report.summary.scorePercent,
  passedRequired,
  failedRequired,
  outputPath,
}, null, 2));

if (hasFlag('printReport')) {
  console.log(JSON.stringify(report, null, 2));
}

if (!report.summary.ready) process.exitCode = 1;
