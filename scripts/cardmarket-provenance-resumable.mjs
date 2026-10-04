import 'dotenv/config';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCataloguePriceDatabase } from './catalogue-price-database.mjs';
import { exportCardmarketReviewCandidates, loadCardmarketRetainedFeeds } from './cardmarket-daily-guide.mjs';
import { resolvePricingV2SupabaseTarget } from './pricing-v2-supabase-target.mjs';

const PAGE_LIMIT = 500;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const option = (args, name) => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const positiveInteger = (value, label, maximum = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw Error(`Invalid ${label}.`);
  return value;
};
async function rpc(api, name, args) {
  const { data, error } = await api.rpc(name, args);
  if (error) throw error;
  return data;
}
async function writeAtomic(path, value) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await writeFile(temporary, value, 'utf8');
  await rename(temporary, absolute);
}

/** Starts or resumes only the private, service-role provenance materialization. */
export async function materializeCardmarketProvenance({ api, runId = null, maxPages = 1 } = {}) {
  if (!api) throw Error('A service API client is required.');
  positiveInteger(maxPages, 'maximum pages');
  if (runId !== null && (typeof runId !== 'string' || !RUN_ID.test(runId))) throw Error('Invalid Cardmarket provenance run id.');
  let activeRunId = runId;
  let status = 'running';
  let processed = 0;
  if (!activeRunId) {
    const begun = await rpc(api, 'begin_cardmarket_provenance_run', {});
    activeRunId = begun?.runId;
    if (!RUN_ID.test(activeRunId ?? '')) throw Error('The service did not return a provenance run id.');
    status = begun.status;
  }
  for (let page = 0; status === 'running' && page < maxPages; page += 1) {
    const result = await rpc(api, 'process_cardmarket_provenance_page', { p_run: activeRunId });
    status = result?.status;
    processed += Number(result?.processed ?? 0);
    if (!['running', 'complete', 'failed'].includes(status)) throw Error('The service returned an invalid provenance run state.');
  }
  return { runId: activeRunId, status, processed };
}

export async function exportCompletedCardmarketProvenance({ api, retained, runId, pageSize = 500 } = {}) {
  if (!RUN_ID.test(runId ?? '')) throw Error('Invalid completed Cardmarket provenance run id.');
  positiveInteger(pageSize, 'provenance export page size', PAGE_LIMIT);
  let afterProductId = 0;
  const candidates = [];
  const skipped = [];
  for (;;) {
    const page = await exportCardmarketReviewCandidates({ api, retained, provenanceRunId: runId, afterProductId, limit: pageSize });
    candidates.push(...page.candidates); skipped.push(...page.skipped);
    if (page.nextAfterProductId === null) break;
    afterProductId = Number(page.nextAfterProductId);
  }
  return { schemaVersion: 1, provenanceRunId: runId, generatedAt: new Date().toISOString(), candidates, skipped };
}

export async function mainCardmarketProvenanceResumable(args = process.argv.slice(2)) {
  const maxPages = positiveInteger(Number(option(args, '--max-pages') ?? 1), 'maximum pages');
  const runId = option(args, '--run') ?? null;
  const exportPath = option(args, '--export');
  if (!args.includes('--materialize')) return { dryRun: true, message: 'Pass --materialize to create or resume the private provenance run.' };
  if (process.env.STACKR_CARDMARKET_PROVENANCE_ENABLED !== 'true') throw Error('Cardmarket provenance materialization is disabled.');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) throw Error('Missing server database credential.');
  const target = resolvePricingV2SupabaseTarget();
  const api = createCataloguePriceDatabase(target.url, key).schema('api');
  const materialized = await materializeCardmarketProvenance({ api, runId, maxPages });
  if (!exportPath) return { project: target.projectRef, ...materialized };
  if (materialized.status !== 'complete') throw Error('The provenance run is incomplete; resume it before exporting review candidates.');
  const cacheDir = option(args, '--cache-dir');
  if (!cacheDir) throw Error('Export requires --cache-dir=<retained Cardmarket directory>.');
  const report = await exportCompletedCardmarketProvenance({ api, retained: await loadCardmarketRetainedFeeds(cacheDir), runId: materialized.runId, pageSize: positiveInteger(Number(option(args, '--page-size') ?? PAGE_LIMIT), 'provenance export page size', PAGE_LIMIT) });
  await writeAtomic(exportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { project: target.projectRef, ...materialized, exportedCandidates: report.candidates.length, skippedCandidates: report.skipped.length, exportPath: resolve(exportPath) };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  mainCardmarketProvenanceResumable().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
