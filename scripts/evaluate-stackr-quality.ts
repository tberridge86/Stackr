import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  evaluateStackrQuality,
  type GoldTestSetManifest,
  type PerformanceObservation,
  type QualityObservation,
} from '../lib/stackrQualityEvaluation';

type ObservationFile = {
  observations: QualityObservation[];
  performance: PerformanceObservation[];
};

function option(name: string, fallback?: string) {
  const direct = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function readJson<T>(filePath: string): T {
  if (!existsSync(filePath)) throw new Error(`Required quality input does not exist: ${filePath}`);
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

const manifestPath = option('manifest', 'data/quality/gold-test-set.template.json')!;
const observationsPath = option('observations', 'data/quality/quality-observations.template.json')!;
const outputPath = option('output', 'outputs/quality/stackr-quality-report.json')!;
const failOnGate = process.argv.includes('--fail-on-gate');

const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8')) as GoldTestSetManifest;
const input = readJson<ObservationFile>(observationsPath);
if (!Array.isArray(input.observations) || !Array.isArray(input.performance)) {
  throw new Error('Quality observations input must contain observations and performance arrays.');
}

const report = evaluateStackrQuality({ manifest, ...input });
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  outputPath,
  datasetKey: report.datasetKey,
  manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  claimStatus: report.claimStatus,
  evidenceCounts: report.evidenceCounts,
  releaseGates: report.releaseGates.map(({ key, status, actualValue, evidenceCount }) => ({
    key,
    status,
    actualValue,
    evidenceCount,
  })),
}, null, 2));

if (failOnGate && report.releaseGates.some((gate) => gate.status !== 'pass')) process.exitCode = 1;
