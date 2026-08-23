import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  buildImportManifest,
  importStagingRows,
  normalizeSoldRows,
  parseCsv,
  validateStagingRows,
} from './lib/ebay-sold-import.mjs';

export const APPROVED_STAGING_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';

function getArg(argv, name, fallback = '') {
  const prefix = `--${name}=`;
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function hasFlag(argv, name) {
  return argv.includes(`--${name}`);
}

function getProjectRef(url) {
  try {
    const host = new URL(url).hostname;
    return host.endsWith('.supabase.co') ? host.split('.')[0] : null;
  } catch {
    return null;
  }
}

function usage() {
  return `Usage:
  npm run pricing:import-ebay-sold -- --file=<verified.csv>
  npm run pricing:import-ebay-sold -- --file=<verified.csv> --apply --target=staging

Dry-run is the default. Writes are limited to Supabase project ${APPROVED_STAGING_PROJECT_REF}.
Required CSV headers:
  variant_id,product_kind,source_item_id,source_url,raw_title,sold_price,shipping_price,currency_code,sold_at,observed_at,condition_code,grader_code,grade_value,sale_type,parsed_match_confidence,attribution_text`;
}

export async function run(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return { help: true };
  }
  const file = getArg(argv, 'file');
  if (!file) throw new Error('Missing --file=<verified.csv>.');
  const apply = hasFlag(argv, 'apply');
  const target = getArg(argv, 'target', 'staging');
  if (target !== 'staging') throw new Error('This importer is locked to target=staging.');
  const supabaseUrl = String(env.SUPABASE_URL ?? `https://${env.SUPABASE_PROJECT_REF ?? APPROVED_STAGING_PROJECT_REF}.supabase.co`).trim();
  const projectRef = getProjectRef(supabaseUrl);
  if (projectRef !== APPROVED_STAGING_PROJECT_REF) throw new Error(`Refusing non-staging Supabase project ${projectRef ?? 'unknown'}.`);
  const key = String(env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!key) throw new Error('Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.');

  const rows = normalizeSoldRows(parseCsv(await readFile(file, 'utf8')));
  const manifest = buildImportManifest(rows);
  const supabase = createClient(supabaseUrl, key);
  const validation = await validateStagingRows(supabase, rows);
  const summary = {
    target,
    projectRef,
    apply,
    rows: rows.length,
    variants: new Set(rows.map((row) => row.variantId)).size,
    manifestSha256: manifest.manifestSha256,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) return { ...summary, dryRun: true };

  const result = await importStagingRows(supabase, rows, validation, {
    manifestSha256: manifest.manifestSha256,
    actor: 'Jack Berridge, Director, STACKRTCG LTD',
  });
  console.log(JSON.stringify(result, null, 2));
  return { ...summary, ...result, dryRun: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(`eBay sold import failed: ${error.message}`);
    process.exitCode = 1;
  });
}
