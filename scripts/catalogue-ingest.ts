import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createSourceAdapter, supportedSourceAdapters } from './catalogue-ingestion/adapters';
import { fetchCatalogueQualityReport } from './catalogue-ingestion/qualityReport';
import { CatalogueIngestionRunner, enqueueWorkItem, readQuarantinedConflicts } from './catalogue-ingestion/pipeline';

function arg(name: string, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function command() {
  return process.argv[2]?.startsWith('--') ? 'run-source' : (process.argv[2] ?? 'help');
}

function adminSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and backend-only service credentials are required for catalogue ingestion.');
  }
  return createClient(url, key);
}

function printHelp() {
  console.log(`Stackr catalogue ingestion

Commands:
  run-source              Run one source adapter.
  run-language            Run one source adapter for a language.
  run-set                 Run one source adapter for one provider set.
  resume-import           Resume using the same run key/checkpoint scope.
  rebuild-record          Rebuild one provider record.
  enqueue                 Add a durable queue item.
  conflicts               Inspect quarantined conflicts.
  quality-report          Print catalogue-quality report JSON.

Supported sources:
  ${supportedSourceAdapters.join(', ')}

Examples:
  npm run catalogue:ingest -- run-source --source=manual-csv --file=data/catalogue.csv
  npm run catalogue:ingest -- run-set --source=tcgdex --language=ja --setId=sv2a
  npm run catalogue:ingest -- run-set --source=pokemon-tcg-api --language=en --setId=me5
  npm run catalogue:quality-report -- --language=ja
`);
}

async function main() {
  const cmd = command();
  if (cmd === 'help' || hasFlag('help')) {
    printHelp();
    return;
  }

  const db = adminSupabase();
  if (cmd === 'quality-report') {
    const report = await fetchCatalogueQualityReport(db, {
      language: arg('language') || undefined,
      limit: Number(arg('limit', '500')),
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (cmd === 'conflicts') {
    const conflicts = await readQuarantinedConflicts(db, {
      limit: Number(arg('limit', '50')),
      sourceId: arg('sourceId') || undefined,
      conflictType: arg('conflictType') || undefined,
    });
    console.log(JSON.stringify({ ok: true, count: conflicts.length, conflicts }, null, 2));
    return;
  }

  if (cmd === 'enqueue') {
    const queueName = arg('queue', 'catalogue_ingestion') as Parameters<typeof enqueueWorkItem>[1]['queueName'];
    const commandName = arg('command', 'run_source');
    const idempotencyKey = arg('idempotencyKey')
      || `${queueName}:${commandName}:${arg('source', 'unknown')}:${arg('language', 'all')}:${arg('setId', 'all')}`;
    const result = await enqueueWorkItem(db, {
      queueName,
      command: commandName,
      idempotencyKey,
      priority: Number(arg('priority', '50')),
      payload: {
        source: arg('source') || null,
        language: arg('language') || null,
        setId: arg('setId') || null,
        providerRecordId: arg('providerRecordId') || null,
      },
      requestId: arg('requestId') || null,
    });
    console.log(JSON.stringify({ ok: true, queueName, command: commandName, ...result }, null, 2));
    return;
  }

  const source = arg('source');
  if (!source) throw new Error(`Missing --source. Supported sources: ${supportedSourceAdapters.join(', ')}.`);

  const adapter = createSourceAdapter({
    source,
    file: arg('file') || undefined,
    language: arg('language') || undefined,
    licenceStatus: arg('licenceStatus') as 'approved' | 'under_review' | 'restricted' | 'denied' | 'unknown' || undefined,
    apiKey: process.env.POKEMON_TCG_API_KEY,
  });
  const runner = new CatalogueIngestionRunner(db, adapter);
  const result = await runner.run({
    command: cmd === 'run-language'
      ? 'run_language'
      : cmd === 'run-set'
        ? 'run_set'
        : cmd === 'resume-import'
          ? 'resume_import'
          : cmd === 'rebuild-record'
            ? 'rebuild_record'
            : 'run_source',
    importType: source.startsWith('manual') ? 'manual' : 'delta',
    language: arg('language') || undefined,
    setId: arg('setId') || undefined,
    providerRecordId: arg('providerRecordId') || undefined,
    limit: arg('limit') ? Number(arg('limit')) : undefined,
    runKey: arg('runKey') || undefined,
    requestId: arg('requestId') || undefined,
    dryRun: hasFlag('dryRun'),
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
