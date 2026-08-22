import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_SUPABASE_REF = 'oakdbbzdqwurpjnoqhmu';
const DEFAULT_MAX_VARIANTS = 2500;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_RESERVE_CALLS = 50;
const QUERIES_PER_VARIANT = 2;

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function exactInteger(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireStagingEnvironment() {
  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const supabaseKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY);
  const clientId = clean(process.env.EBAY_CLIENT_ID);
  const clientSecret = clean(process.env.EBAY_CLIENT_SECRET);
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Staging Supabase URL and backend-only key are required.');
  }
  if (!supabaseUrl.includes(STAGING_SUPABASE_REF) || supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error(`Refusing to run outside staging project ${STAGING_SUPABASE_REF}.`);
  }
  if (!clientId || !clientSecret) {
    throw new Error('eBay Browse client credentials are required.');
  }
  return { clientId, clientSecret, supabaseUrl };
}

async function applicationToken(clientId, clientSecret) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: process.env.EBAY_OAUTH_SCOPES ?? 'https://api.ebay.com/oauth/api_scope',
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !clean(payload?.access_token)) {
    throw new Error(`eBay OAuth request failed with status ${response.status}.`);
  }
  return payload.access_token;
}

async function browseQuota(token) {
  const url = new URL('https://api.ebay.com/developer/analytics/v1_beta/rate_limit/');
  url.searchParams.set('api_context', 'buy');
  url.searchParams.set('api_name', 'browse');
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`eBay Analytics request failed with status ${response.status}.`);
  }
  const rates = (Array.isArray(payload?.rateLimits) ? payload.rateLimits : [])
    .filter((limit) => String(limit?.apiContext).toLowerCase() === 'buy')
    .filter((limit) => String(limit?.apiName).toLowerCase() === 'browse')
    .flatMap((limit) => (Array.isArray(limit?.resources) ? limit.resources : []))
    .flatMap((resource) => (Array.isArray(resource?.rates) ? resource.rates : []).map((rate) => ({
      resource: clean(resource?.name) ?? 'unknown',
      limit: Number(rate?.limit),
      remaining: Number(rate?.remaining),
      count: Number(rate?.count),
      reset: clean(rate?.reset),
      timeWindow: Number(rate?.timeWindow),
    })))
    .filter((rate) => Number.isFinite(rate.limit) && Number.isFinite(rate.remaining))
    .filter((rate) => rate.timeWindow >= 86_400);
  if (!rates.length) {
    throw new Error('eBay Analytics returned no daily Browse API quota.');
  }
  return {
    limit: Math.min(...rates.map((rate) => rate.limit)),
    remaining: Math.min(...rates.map((rate) => rate.remaining)),
    reset: rates.map((rate) => rate.reset).filter(Boolean).sort()[0] ?? null,
    rates,
  };
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      STACKR_CATALOGUE_IMPORT_TARGET: 'staging',
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.`);
  }
  return result.stdout;
}

function persistReceipt(receiptPath, receipt) {
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log(`Run a quota-bounded eBay recognition-evidence import against StackR staging only.

Options:
  --maxVariants=2500  Maximum balanced launch-language variants to attempt.
  --batchSize=100     Variants per independently resumable ingestion batch.
  --reserveCalls=50   Browse calls deliberately left unused for verification/retries.
  --outputDir=<path>  Manifest and run receipt directory.`);
    return;
  }

  const maximumVariants = exactInteger(arg('maxVariants', String(DEFAULT_MAX_VARIANTS)), 'maxVariants', 1, 30_000);
  const batchSize = exactInteger(arg('batchSize', String(DEFAULT_BATCH_SIZE)), 'batchSize', 1, 500);
  const reserveCalls = exactInteger(arg('reserveCalls', String(DEFAULT_RESERVE_CALLS)), 'reserveCalls', 0, 1_000);
  const outputDir = path.resolve(arg('outputDir', 'reports/recognition/ebay-evidence-run'));
  mkdirSync(outputDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const runId = `ebay-recognition-${startedAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
  const manifestPath = path.join(outputDir, `${runId}-fingerprints.json`);
  const receiptPath = path.join(outputDir, `${runId}-receipt.json`);
  const environment = requireStagingEnvironment();
  const token = await applicationToken(environment.clientId, environment.clientSecret);
  const quotaBefore = await browseQuota(token);
  const usableCalls = Math.max(0, quotaBefore.remaining - reserveCalls);
  const quotaBoundVariants = Math.floor(usableCalls / QUERIES_PER_VARIANT);
  const selectedVariants = Math.min(maximumVariants, quotaBoundVariants);
  if (selectedVariants < 1) {
    throw new Error(`No safe Browse quota remains. Remaining ${quotaBefore.remaining}; reserve ${reserveCalls}.`);
  }

  const receipt = {
    schemaVersion: 'stackr-ebay-recognition-evidence-run-v1.0.0',
    status: 'running',
    startedAt,
    finishedAt: null,
    sourceProjectRef: STAGING_SUPABASE_REF,
    productionModified: false,
    runId,
    quotaBefore,
    quotaAfter: null,
    reserveCalls,
    queriesPerVariantUpperBound: QUERIES_PER_VARIANT,
    maximumVariantsRequested: maximumVariants,
    selectedVariants,
    manifestPath,
    manifestSha256: null,
    manifestLanguageCounts: null,
    completedVariants: 0,
    completedBatches: 0,
    failedBatchOffset: null,
    error: null,
  };
  persistReceipt(receiptPath, receipt);

  try {
    run('npx', [
      'tsx',
      'scripts/export-recognition-internet-evidence-manifest.ts',
      `--output=${manifestPath}`,
      `--maxVariants=${selectedVariants}`,
      '--pageSize=100',
    ]);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    receipt.manifestSha256 = manifest.manifestSha256 ?? null;
    receipt.manifestLanguageCounts = manifest.languageCounts ?? null;
    receipt.selectedVariants = Number(manifest.variantCount ?? selectedVariants);
    persistReceipt(receiptPath, receipt);

    for (let offset = 0; offset < receipt.selectedVariants; offset += batchSize) {
      const currentBatchSize = Math.min(batchSize, receipt.selectedVariants - offset);
      receipt.failedBatchOffset = offset;
      persistReceipt(receiptPath, receipt);
      run('npx', [
        'tsx',
        'scripts/catalogue-ingest.ts',
        'run-source',
        '--source=ebay-listing-evidence',
        `--file=${manifestPath}`,
        `--offset=${offset}`,
        `--limit=${currentBatchSize}`,
        '--writeConcurrency=16',
        '--target=staging',
        `--runKey=${runId}-offset-${offset}`,
        `--requestId=${runId}-offset-${offset}`,
      ]);
      receipt.completedVariants += currentBatchSize;
      receipt.completedBatches += 1;
      receipt.failedBatchOffset = null;
      persistReceipt(receiptPath, receipt);
    }

    receipt.quotaAfter = await browseQuota(token);
    receipt.status = 'completed';
    receipt.finishedAt = new Date().toISOString();
    persistReceipt(receiptPath, receipt);
    console.log(JSON.stringify({ ok: true, receiptPath, ...receipt }, null, 2));
  } catch (error) {
    receipt.status = 'failed';
    receipt.finishedAt = new Date().toISOString();
    receipt.error = error instanceof Error ? error.message : String(error);
    try {
      receipt.quotaAfter = await browseQuota(token);
    } catch {
      receipt.quotaAfter = null;
    }
    persistReceipt(receiptPath, receipt);
    throw error;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
