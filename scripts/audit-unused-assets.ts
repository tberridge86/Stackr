import fs from 'node:fs';
import path from 'node:path';

type AssetReportRow = {
  path: string;
  bytes: number;
  bucket: string;
};

const workspaceRoot = process.cwd();
const assetRoot = path.join(workspaceRoot, 'assets');
const sourceRoots = ['app', 'components', 'features', 'lib', 'constants', 'hooks'];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.json']);
const assetExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.jfif',
  '.svg',
  '.json',
  '.lottie',
  '.onnx',
  '.ort',
  '.bin',
  '.zip',
]);

const intentionallyOutOfBundlePrefixes = [
  'assets/ARCHIVE/',
  'assets/New folder/',
];

function toPosix(value: string) {
  return value.replace(/\\/g, '/');
}

function walkFiles(root: string, shouldInclude: (filePath: string) => boolean) {
  const results: string[] = [];
  if (!fs.existsSync(root)) return results;

  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.cache') continue;
        stack.push(fullPath);
      } else if (shouldInclude(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function getBucket(assetPath: string) {
  const parts = assetPath.split('/');
  return parts.length >= 3 ? `${parts[0]}/${parts[1]}` : parts[0];
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${bytes} B`;
}

function printGroup(title: string, rows: AssetReportRow[], limit = 40) {
  console.log(`\n${title}: ${rows.length}`);
  const byBucket = new Map<string, { count: number; bytes: number }>();
  for (const row of rows) {
    const current = byBucket.get(row.bucket) ?? { count: 0, bytes: 0 };
    byBucket.set(row.bucket, { count: current.count + 1, bytes: current.bytes + row.bytes });
  }

  [...byBucket.entries()]
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .forEach(([bucket, info]) => {
      console.log(`  ${bucket}: ${info.count} files, ${formatBytes(info.bytes)}`);
    });

  rows.slice(0, limit).forEach((row) => {
    console.log(`  - ${row.path} (${formatBytes(row.bytes)})`);
  });

  if (rows.length > limit) {
    console.log(`  ... ${rows.length - limit} more`);
  }
}

const sourceFiles = sourceRoots.flatMap((root) =>
  walkFiles(path.join(workspaceRoot, root), (filePath) => sourceExtensions.has(path.extname(filePath)))
);

const sourceText = sourceFiles
  .map((filePath) => fs.readFileSync(filePath, 'utf8'))
  .join('\n')
  .replace(/\\/g, '/');

const assetFiles = walkFiles(assetRoot, (filePath) => assetExtensions.has(path.extname(filePath).toLowerCase()));

const referenced: AssetReportRow[] = [];
const archiveOrDesignOnly: AssetReportRow[] = [];
const candidates: AssetReportRow[] = [];

for (const filePath of assetFiles) {
  const relativePath = toPosix(path.relative(workspaceRoot, filePath));
  const stats = fs.statSync(filePath);
  const row = {
    path: relativePath,
    bytes: stats.size,
    bucket: getBucket(relativePath),
  };

  if (intentionallyOutOfBundlePrefixes.some((prefix) => relativePath.startsWith(prefix))) {
    archiveOrDesignOnly.push(row);
    continue;
  }

  if (sourceText.includes(relativePath)) {
    referenced.push(row);
  } else {
    candidates.push(row);
  }
}

const totalBytes = assetFiles.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
const candidateBytes = candidates.reduce((sum, row) => sum + row.bytes, 0);

console.log('Stackr asset audit');
console.log(`Source files scanned: ${sourceFiles.length}`);
console.log(`Assets scanned: ${assetFiles.length}`);
console.log(`Total asset size: ${formatBytes(totalBytes)}`);
console.log(`Likely unused candidate size: ${formatBytes(candidateBytes)}`);
console.log('\nThis is an audit only. Do not delete candidates until an iOS/Android bundle passes and the relevant screens are visually checked.');

printGroup('Referenced by source literals', referenced, 12);
printGroup('Archive/design-only buckets', archiveOrDesignOnly, 20);
printGroup('Likely unused candidates', candidates, 80);
