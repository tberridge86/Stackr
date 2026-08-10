import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { CardIdentityCatalogueManifest } from '../lib/cardIdentityCataloguePack';
import { CARD_IDENTITY_SEARCH_ENGINE_VERSION } from '../lib/cardIdentitySearchReference';

const REPORT_JSON_PATH = 'ml/reports/native-search-benchmark.json';
const REPORT_HTML_PATH = 'ml/reports/native-search-benchmark.html';
const MANIFEST_PATH = 'assets/catalogue/catalogue-manifest.json';
const TARGET_P95_MS = 75;

type BenchmarkTarget = {
  label: string;
  embeddingCount: number;
  status: 'blocked_no_embeddings' | 'native_unavailable';
  loadTimeMs: null;
  memoryBytes: null;
  p50SearchMs: null;
  p95SearchMs: null;
  maxSearchMs: null;
  topKCorrect: null;
  message: string;
};

function readCatalogueManifest() {
  if (!existsSync(MANIFEST_PATH)) return null;
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as CardIdentityCatalogueManifest;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

const manifest = readCatalogueManifest();
const pilotEmbeddingCount = manifest?.embeddings.count ?? 0;
const unavailableMessage =
  'Native Expo module benchmarks require an installed development build on the reference Android device.';

const targets: BenchmarkTarget[] = [
  {
    label: 'pilot catalogue',
    embeddingCount: pilotEmbeddingCount,
    status: pilotEmbeddingCount > 0 ? 'native_unavailable' : 'blocked_no_embeddings',
    loadTimeMs: null,
    memoryBytes: null,
    p50SearchMs: null,
    p95SearchMs: null,
    maxSearchMs: null,
    topKCorrect: null,
    message: pilotEmbeddingCount > 0
      ? unavailableMessage
      : 'The current catalogue pack is blocked and contains zero approved reference embeddings.',
  },
  ...[25_000, 50_000, 100_000].map<BenchmarkTarget>((embeddingCount) => ({
    label: `${embeddingCount.toLocaleString('en-US')} embeddings`,
    embeddingCount,
    status: 'native_unavailable',
    loadTimeMs: null,
    memoryBytes: null,
    p50SearchMs: null,
    p95SearchMs: null,
    maxSearchMs: null,
    topKCorrect: null,
    message: unavailableMessage,
  })),
];

const report = {
  generatedAt: new Date().toISOString(),
  engineVersion: CARD_IDENTITY_SEARCH_ENGINE_VERSION,
  implementation: {
    android: 'modules/stackr-card-vision/android/src/main/java/com/stackr/cardvision/StackrCardIdentitySearchEngine.kt',
    ios: 'modules/stackr-card-vision/ios/StackrCardIdentitySearchEngine.swift',
    bridge: 'lib/stackrCardVision.ts',
    searchType: 'exact_native_flat_search',
    approximateIndexAdded: false,
  },
  target: {
    referenceDevice: 'agreed reference Android device',
    p95SearchMsFor100kEmbeddings: TARGET_P95_MS,
    targetIsAClaimedResult: false,
  },
  currentEnvironment: {
    nativeBenchmarkAvailable: false,
    reason: unavailableMessage,
    performanceMeasuredOnRealDevice: false,
  },
  catalogue: manifest
    ? {
      status: manifest.status,
      packVersion: manifest.packVersion,
      modelVersion: manifest.modelVersion,
      embeddingCount: manifest.embeddings.count,
      missingCount: manifest.embeddings.missingCount,
      approvedForInstall: manifest.approvedForInstall,
      installRejectionReason: manifest.installRejectionReason,
    }
    : null,
  targets,
  correctness: {
    pythonReferenceCommand: 'npm run test:card-identity-search',
    nativeTopKParityMeasured: false,
    reason: 'Native module cannot be invoked from this desktop Node shell.',
  },
};

mkdirSync('ml/reports', { recursive: true });
writeFileSync(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);

const rows = targets.map((target) => `
  <tr>
    <td>${escapeHtml(target.label)}</td>
    <td>${target.embeddingCount.toLocaleString('en-US')}</td>
    <td>${escapeHtml(target.status)}</td>
    <td>not measured</td>
    <td>not measured</td>
    <td>not measured</td>
    <td>${escapeHtml(target.message)}</td>
  </tr>
`).join('');

writeFileSync(REPORT_HTML_PATH, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Stackr Native Embedding Search Benchmark</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #17142c; }
    table { border-collapse: collapse; width: 100%; margin-top: 18px; }
    th, td { border: 1px solid #d7d2ea; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f2efff; }
    code { background: #f6f4ff; padding: 2px 4px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Stackr Native Embedding Search Benchmark</h1>
  <p>Engine: <code>${escapeHtml(CARD_IDENTITY_SEARCH_ENGINE_VERSION)}</code></p>
  <p>Exact native flat search has been implemented, but this shell cannot execute the Expo native module. Real-device search timings are therefore not claimed here.</p>
  <p>Initial target: p95 below ${TARGET_P95_MS} ms for 100,000 embeddings on the agreed reference Android device.</p>
  <table>
    <thead>
      <tr>
        <th>Target</th>
        <th>Embeddings</th>
        <th>Status</th>
        <th>Load</th>
        <th>p50 Search</th>
        <th>p95 Search</th>
        <th>Message</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p>Run <code>npm run test:card-identity-search</code> for deterministic Python reference parity on the search semantics. Run the native benchmark from an installed development build for real device timings.</p>
</body>
</html>
`);

console.log(JSON.stringify({
  ok: true,
  reportJson: REPORT_JSON_PATH,
  reportHtml: REPORT_HTML_PATH,
  nativeBenchmarkAvailable: false,
  targetP95MsFor100kEmbeddings: TARGET_P95_MS,
}, null, 2));
