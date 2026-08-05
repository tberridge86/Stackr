import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createSourceAdapter, supportedSourceAdapters } from './catalogue-ingestion/adapters';
import { fetchCatalogueQualityReport } from './catalogue-ingestion/qualityReport';
import { CatalogueIngestionRunner, enqueueWorkItem, readQuarantinedConflicts } from './catalogue-ingestion/pipeline';
import {
  normaliseLanguageCode,
  SUPPORTED_CATALOGUE_LANGUAGE_CODES,
} from './catalogue-ingestion/sourceAdapter';

const STAGING_SUPABASE_REF = 'lmwfhvexfcoyeuoyrlco';
const PRODUCTION_SUPABASE_REF = 'oakdbbzdqwurpjnoqhmu';

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

function noWriteSupabase() {
  return {
    schema(schema: string) {
      throw new Error(`Dry-run must not access Supabase schema ${schema}.`);
    },
  };
}

function importTarget() {
  return (arg('target') || process.env.STACKR_CATALOGUE_IMPORT_TARGET || process.env.STACKR_IMPORT_TARGET || '').trim().toLowerCase();
}

function requireStagingTarget() {
  const target = importTarget();
  if (target !== 'staging') {
    throw new Error('Catalogue imports and queue writes must target staging. Pass --target=staging or set STACKR_CATALOGUE_IMPORT_TARGET=staging.');
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  if (!supabaseUrl.includes(STAGING_SUPABASE_REF)) {
    throw new Error(`Catalogue imports must use the canonical staging Supabase project ${STAGING_SUPABASE_REF}. Set SUPABASE_URL=https://${STAGING_SUPABASE_REF}.supabase.co.`);
  }
  if (supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error(`Refusing catalogue import against the known production Supabase project ${PRODUCTION_SUPABASE_REF}.`);
  }
}

function languageArg() {
  const language = arg('language');
  return language ? normaliseLanguageCode(language) : undefined;
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

Supported languages:
  ${SUPPORTED_CATALOGUE_LANGUAGE_CODES.join(', ')}

Examples:
  npm run catalogue:ingest -- run-source --source=manual-csv --file=data/catalogue.csv --target=staging
  npm run catalogue:ingest -- run-set --source=tcgdex --language=ja --setId=sv2a --target=staging
  npm run catalogue:ingest -- run-language --source=tcgdex --language=zh-cn --dryRun
  npm run catalogue:ingest -- run-language --source=tcgdex --language=en --offset=500 --limit=500 --target=staging
  npm run catalogue:ingest -- run-set --source=tcgdex --language=ja --setId=sv2a --target=staging --allowImageAssets
  npm run catalogue:quality-report -- --language=ja

Image assets:
  Off by default. Use --allowImageAssets only after each imported record has
  language + set_code + collector_number + variant + finish.
`);
}

function serialiseCliError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      message: typeof record.message === 'string' ? record.message : String(error),
      code: record.code ?? null,
      details: record.details ?? null,
      hint: record.hint ?? null,
      status: record.status ?? record.statusCode ?? null,
    };
  }
  return {
    message: String(error),
  };
}

async function main() {
  const cmd = command();
  if (cmd === 'help' || hasFlag('help')) {
    printHelp();
    return;
  }

  if (cmd === 'quality-report') {
    const db = adminSupabase();
    const report = await fetchCatalogueQualityReport(db, {
      language: languageArg(),
      limit: Number(arg('limit', '500')),
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (cmd === 'conflicts') {
    const db = adminSupabase();
    const conflicts = await readQuarantinedConflicts(db, {
      limit: Number(arg('limit', '50')),
      sourceId: arg('sourceId') || undefined,
      conflictType: arg('conflictType') || undefined,
    });
    console.log(JSON.stringify({ ok: true, count: conflicts.length, conflicts }, null, 2));
    return;
  }

  if (cmd === 'enqueue') {
    requireStagingTarget();
    const language = languageArg();
    const db = adminSupabase();
    const queueName = arg('queue', 'catalogue_ingestion') as Parameters<typeof enqueueWorkItem>[1]['queueName'];
    const commandName = arg('command', 'run_source');
    const idempotencyKey = arg('idempotencyKey')
      || `${queueName}:${commandName}:${arg('source', 'unknown')}:${language ?? 'all'}:${arg('setId', 'all')}`;
    const result = await enqueueWorkItem(db, {
      queueName,
      command: commandName,
      idempotencyKey,
      priority: Number(arg('priority', '50')),
      payload: {
        source: arg('source') || null,
        language: language ?? null,
        setId: arg('setId') || null,
        providerRecordId: arg('providerRecordId') || null,
        allowImageAssets: hasFlag('allowImageAssets'),
      },
      requestId: arg('requestId') || null,
    });
    console.log(JSON.stringify({ ok: true, queueName, command: commandName, ...result }, null, 2));
    return;
  }

  const source = arg('source');
  if (!source) throw new Error('Missing --source. Use --source=manual-csv, --source=manual-json or --source=tcgdex.');

  const dryRun = hasFlag('dryRun');
  if (!dryRun) requireStagingTarget();
  const language = languageArg();
  const adapter = createSourceAdapter({
    source,
    file: arg('file') || undefined,
    language,
    licenceStatus: arg('licenceStatus') as 'approved' | 'under_review' | 'restricted' | 'denied' | 'unknown' || undefined,
    assetLicenceStatus: (arg('assetLicenceStatus') || arg('asset-licence-status')) as 'approved' | 'under_review' | 'restricted' | 'denied' | 'unknown' || undefined,
  });
  const db = dryRun ? noWriteSupabase() : adminSupabase();
  const runner = new CatalogueIngestionRunner(db, adapter);
  const offset = Number(arg('offset', '0'));
  if (!Number.isInteger(offset) || offset < 0) throw new Error('--offset must be a non-negative integer.');
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
    language,
    setId: arg('setId') || undefined,
    providerRecordId: arg('providerRecordId') || undefined,
    limit: arg('limit') ? Number(arg('limit')) : undefined,
    cursor: { offset },
    runKey: arg('runKey') || undefined,
    requestId: arg('requestId') || undefined,
    dryRun,
    allowImageAssets: hasFlag('allowImageAssets'),
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  const serialised = serialiseCliError(error);
  console.error(JSON.stringify({
    ok: false,
    error: serialised.message,
    details: serialised,
  }, null, 2));
  process.exitCode = 1;
});
