import { readFileSync } from 'node:fs';

function argument(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const filePath = argument('file');
if (!filePath) throw new Error('Missing --file=<npm-audit-json>.');
const payload = JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
const counts = payload.metadata?.vulnerabilities ?? {};
const maxCritical = Number(argument('max-critical', '0'));
const maxHigh = Number(argument('max-high', String(Number.MAX_SAFE_INTEGER)));
const ok = Number(counts.critical ?? 0) <= maxCritical && Number(counts.high ?? 0) <= maxHigh;

console.log(JSON.stringify({
  ok,
  counts: {
    critical: Number(counts.critical ?? 0),
    high: Number(counts.high ?? 0),
    moderate: Number(counts.moderate ?? 0),
    low: Number(counts.low ?? 0),
  },
  thresholds: { maxCritical, maxHigh },
}, null, 2));
if (!ok) process.exit(1);
