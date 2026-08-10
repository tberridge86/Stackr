import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const binaryExtensions = new Set([
  '.bin', '.gif', '.ico', '.jpeg', '.jpg', '.keystore', '.onnx', '.ort', '.parquet',
  '.pdf', '.png', '.p12', '.ttf', '.webp', '.zip',
]);
const rules = [
  ['supabase_secret_key', /sb_secret_[A-Za-z0-9_-]{20,}/g],
  ['supabase_access_token', /sbp_[A-Za-z0-9_-]{20,}/g],
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['github_token', /(?:github_pat_[A-Za-z0-9_]{40,}|ghp_[A-Za-z0-9]{36,})/g],
  ['aws_access_key', /AKIA[0-9A-Z]{16}/g],
  ['stripe_live_secret', /(?:sk|rk)_live_[A-Za-z0-9]{16,}/g],
  [
    'assigned_server_secret',
    /(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|RAILWAY_TOKEN|RAILWAY_API_TOKEN|CLOUDFLARE_API_TOKEN|EBAY_CLIENT_SECRET|XIMILAR_API_TOKEN|CARDSIGHT_API_KEY|POKEMON_TCG_API_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|SCRYDEX_API_KEY|POKEMON_PRICE_TRACKER_API_KEY|POKETRACE_API_KEY|CARDMATRIX_API_KEY|POKEWALLET_API_KEY)\s*[:=]\s*["'](?!\$|<|\{\{|REPLACE_|example|placeholder)[^"'\r\n]{12,}["']/gi,
  ],
];

const args = process.argv.slice(2);
const historyRange = args.find((arg) => arg.startsWith('--history-range='))?.slice('--history-range='.length) ?? null;
const directory = args.find((arg) => arg.startsWith('--directory='))?.slice('--directory='.length) ?? null;

function inspectSource(source, location, findings) {
  if (source.includes('\0')) return;
  for (const [rule, expression] of rules) {
    expression.lastIndex = 0;
    if (expression.test(source)) findings.push({ path: location.replace(/\\/g, '/'), rule });
  }
  const jwtExpression = /eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g;
  for (const match of source.matchAll(jwtExpression)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
      if (payload?.role === 'service_role') {
        findings.push({ path: location.replace(/\\/g, '/'), rule: 'supabase_service_role_jwt' });
        break;
      }
    } catch {
      // Ignore strings that merely resemble JWTs.
    }
  }
}

function listDirectoryFiles(root) {
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  visit(root);
  return files;
}

const findings = [];
let repositoryFilesScanned = 0;
let bundleFilesScanned = 0;

if (directory) {
  const root = path.resolve(directory);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`Secret scan directory does not exist: ${directory}`);
    process.exit(1);
  }
  for (const filePath of listDirectoryFiles(root)) {
    const extension = path.extname(filePath).toLowerCase();
    if (binaryExtensions.has(extension)) continue;
    if (statSync(filePath).size > 32 * 1024 * 1024) continue;
    inspectSource(readFileSync(filePath, 'utf8'), path.relative(process.cwd(), filePath), findings);
    bundleFilesScanned += 1;
  }
} else {
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
  if (listed.status !== 0) {
    console.error('Unable to enumerate tracked files for secret scanning.');
    process.exit(1);
  }
  for (const relativePath of listed.stdout.split('\0').filter(Boolean)) {
    const extension = path.extname(relativePath).toLowerCase();
    if (binaryExtensions.has(extension)) continue;
    const filePath = path.resolve(relativePath);
    if (statSync(filePath).size > 4 * 1024 * 1024) continue;
    inspectSource(readFileSync(filePath, 'utf8'), relativePath, findings);
    repositoryFilesScanned += 1;
  }
}

if (historyRange) {
  if (!/^[0-9A-Za-z._/^~-]+\.{2,3}[0-9A-Za-z._/^~-]+$/.test(historyRange)) {
    console.error('Invalid --history-range value.');
    process.exit(1);
  }
  const history = spawnSync(
    'git',
    ['log', '--format=commit %H', '--no-ext-diff', '--unified=0', historyRange],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  );
  if (history.status !== 0) {
    console.error(`Unable to inspect Git history range: ${historyRange}`);
    process.exit(1);
  }
  inspectSource(history.stdout, `git-history:${historyRange}`, findings);
}

if (findings.length) {
  console.error(JSON.stringify({ ok: false, findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  repositoryFilesScanned,
  bundleFilesScanned,
  historyRange,
}));
