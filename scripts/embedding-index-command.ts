import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildEmbeddingIndexRegenerationPlan,
  type EmbeddingIndexRegenerationScope,
  type ModelBenchmarkRun,
} from '../lib/modelBenchmarkV1';

const BENCHMARK_REPORT_PATH = 'ml/reports/model-benchmark-v1.json';
const PLAN_PATH = 'ml/reports/embedding-index-regeneration-plan.json';

function parseArgs(argv: string[]) {
  const parsed = new Map<string, string | boolean>();
  for (const arg of argv) {
    if (arg === '--activate') {
      parsed.set('activate', true);
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) parsed.set(match[1], match[2]);
  }
  return parsed;
}

function scopeFromArgs(args: Map<string, string | boolean>): EmbeddingIndexRegenerationScope {
  const scope = args.get('scope') ?? 'full';
  const value = args.get('id');
  if (scope === 'card') return { scopeType: 'card', scopeValue: String(value ?? '') };
  if (scope === 'set') return { scopeType: 'set', scopeValue: String(value ?? '') };
  if (scope === 'language') return { scopeType: 'language', scopeValue: String(value ?? '') };
  if (scope === 'full') return { scopeType: 'full', scopeValue: null };
  throw new Error(`Unsupported scope "${String(scope)}". Use card, set, language or full.`);
}

function readBenchmarkRun(): ModelBenchmarkRun {
  if (!existsSync(BENCHMARK_REPORT_PATH)) {
    throw new Error(`${BENCHMARK_REPORT_PATH} is missing. Run scripts/benchmark-embedding-models.ts first.`);
  }
  return JSON.parse(readFileSync(BENCHMARK_REPORT_PATH, 'utf8')) as ModelBenchmarkRun;
}

function writeJson(filePath: string, payload: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

const args = parseArgs(process.argv.slice(2));
const benchmarkRun = readBenchmarkRun();
const modelId = args.has('model') ? String(args.get('model')) : null;
const indexVersion = args.has('index-version') ? String(args.get('index-version')) : null;

const plan = buildEmbeddingIndexRegenerationPlan({
  benchmarkRun,
  scope: scopeFromArgs(args),
  modelId,
  indexVersion,
  shouldActivate: args.get('activate') === true,
});

writeJson(PLAN_PATH, plan);
console.log(JSON.stringify({
  status: plan.status,
  modelId: plan.modelId,
  indexVersion: plan.indexVersion,
  scope: plan.scope,
  jobKey: plan.jobKey,
  blockedReasons: plan.blockedReasons,
  planPath: PLAN_PATH,
}, null, 2));
