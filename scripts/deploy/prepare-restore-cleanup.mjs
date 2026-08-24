import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const APPLICATION_SCHEMAS = ['catalog', 'ingest', 'market', 'ml', 'api', 'audit', 'private', 'public'];

function decodeIdentifier(value) {
  return value.replaceAll('""', '"');
}

export function buildRestoreCleanupSql(dataDump) {
  return buildRestoreCleanupSqlWithRoles(dataDump, '');
}

function addInternalTable(line, internalTables) {
  const match = line.match(/^COPY\s+("((?:[^"]|"")+)"\."((?:[^"]|"")+)")\s+\(/);
  if (!match) return;
  const schema = decodeIdentifier(match[2]);
  if (!APPLICATION_SCHEMAS.includes(schema) && schema !== 'supabase_migrations') {
    internalTables.add(match[1]);
  }
}

export function applicationRolesFromDump(roleDump) {
  const roles = new Set();
  for (const line of String(roleDump).split(/\r?\n/)) {
    if (/^\s*--/.test(line)) continue;
    const match = line.match(/^\s*CREATE\s+ROLE\s+"((?:[^"]|"")+)"\s*;/i);
    if (match) roles.add(decodeIdentifier(match[1]));
  }
  return [...roles].sort();
}

function buildRestoreCleanupSqlForTables(
  internalTables,
  roleDump,
  { terminateClientSessions = false } = {},
) {
  const applicationRoles = applicationRolesFromDump(roleDump);
  const terminateSessionsSql = `SELECT pg_terminate_backend(pid)
FROM pg_stat_activity AS activity
LEFT JOIN pg_roles AS role_entry ON role_entry.rolname = activity.usename
WHERE activity.datname = current_database()
  AND activity.pid <> pg_backend_pid()
  AND activity.backend_type = 'client backend'
  AND COALESCE(role_entry.rolsuper, false) = false;`;
  const statements = [
    '\\set ON_ERROR_STOP on',
    "SET statement_timeout = 0;",
    "SET lock_timeout = '5min';",
    ...(terminateClientSessions ? [terminateSessionsSql] : []),
    ...APPLICATION_SCHEMAS.flatMap((schema) => [
      ...(terminateClientSessions ? [terminateSessionsSql] : []),
      `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`,
    ]),
    ...applicationRoles.map((role) => `DROP ROLE IF EXISTS "${role.replaceAll('"', '""')}";`),
    'CREATE SCHEMA "public" AUTHORIZATION "postgres";',
    'GRANT USAGE ON SCHEMA "public" TO "anon", "authenticated", "service_role";',
    'DROP SCHEMA IF EXISTS "supabase_migrations" CASCADE;',
    ...[...internalTables].sort().map((table) => `TRUNCATE TABLE ONLY ${table} CASCADE;`),
    '',
  ];

  return {
    sql: `${statements.join('\n')}\n`,
    droppedSchemaCount: APPLICATION_SCHEMAS.length + 1,
    droppedRoleCount: applicationRoles.length,
    truncatedTableCount: internalTables.size,
    terminateClientSessions,
  };
}

export function buildRestoreCleanupSqlWithRoles(dataDump, roleDump, options = {}) {
  const internalTables = new Set();
  for (const line of String(dataDump).split(/\r?\n/)) addInternalTable(line, internalTables);
  return buildRestoreCleanupSqlForTables(internalTables, roleDump, options);
}

export async function buildRestoreCleanupSqlFromFile(dataPath, roleDump = '', options = {}) {
  const internalTables = new Set();
  const lines = createInterface({
    input: createReadStream(dataPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) addInternalTable(line, internalTables);
  return buildRestoreCleanupSqlForTables(internalTables, roleDump, options);
}

async function main() {
  const terminateClientSessions = process.argv.includes('--terminate-client-sessions');
  const positional = process.argv.slice(2).filter((value) => value !== '--terminate-client-sessions');
  const [dataPath, outputPath, rolesPath] = positional;
  if (!dataPath || !outputPath) throw new Error('data_and_output_paths_required');
  const result = await buildRestoreCleanupSqlFromFile(
    dataPath,
    rolesPath ? readFileSync(rolesPath, 'utf8') : '',
    { terminateClientSessions },
  );
  writeFileSync(outputPath, result.sql, 'utf8');
  console.log(JSON.stringify({
    schemaVersion: 'stackr-restore-cleanup-v1.3.0',
    droppedSchemaCount: result.droppedSchemaCount,
    droppedRoleCount: result.droppedRoleCount,
    truncatedTableCount: result.truncatedTableCount,
    terminateClientSessions: result.terminateClientSessions,
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`prepare_restore_cleanup_failed:${error.message}`);
    process.exitCode = 1;
  });
}
