#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { enqueueExistingAssetMigration } from '../backend/lib/assetRepository.js';

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function adminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and backend-only service credentials are required for asset migration.');
  }
  return createClient(url, key);
}

function printHelp() {
  console.log(`Stackr asset migration

Queues existing catalogue image records for the Stage 4 asset-processing pipeline.
The command does not download or mirror third-party images by itself.

Examples:
  npm run asset:migrate-existing -- --dryRun --limit=25
  npm run asset:migrate-existing -- --assetType=card_image --limit=100

Options:
  --dryRun              Inspect rows without queueing work.
  --assetType=<type>    Filter by catalog.assets.asset_type.
  --setId=<uuid>        Filter by canonical set ID.
  --printingId=<uuid>   Filter by canonical printing ID.
  --variantId=<uuid>    Filter by canonical variant ID.
  --limit=<number>      Number of rows to inspect, default 100, max 1000.
`);
}

async function main() {
  if (hasFlag('help') || process.argv.includes('help')) {
    printHelp();
    return;
  }

  const result = await enqueueExistingAssetMigration(adminSupabase(), {
    assetType: arg('assetType') || undefined,
    setId: arg('setId') || undefined,
    printingId: arg('printingId') || undefined,
    variantId: arg('variantId') || undefined,
    limit: Number(arg('limit', '100')),
    dryRun: hasFlag('dryRun'),
    requestId: arg('requestId') || undefined,
  });

  console.log(JSON.stringify({
    ok: true,
    command: 'asset:migrate-existing',
    dryRun: hasFlag('dryRun'),
    ...result,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    command: 'asset:migrate-existing',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
