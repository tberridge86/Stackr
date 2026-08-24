import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const APPLICATION_SCHEMAS = [
  'catalog',
  'ingest',
  'market',
  'ml',
  'api',
  'audit',
  'private',
  'public',
];

function decodeIdentifier(value) {
  return value.replaceAll('""', '"');
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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

function buildRestoreCleanupSqlForTables(internalTables, roleDump) {
  const applicationRoles = applicationRolesFromDump(roleDump);
  const roleCleanupStatements = applicationRoles.flatMap((role) => {
    const literal = quoteLiteral(role);
    return [
      `SELECT format('GRANT %I TO CURRENT_USER;', rolname)`,
      `FROM pg_catalog.pg_roles WHERE rolname = ${literal}`,
      '\\gexec',
      `SELECT format('REASSIGN OWNED BY %I TO "postgres";', rolname)`,
      `FROM pg_catalog.pg_roles WHERE rolname = ${literal}`,
      '\\gexec',
      `SELECT format('DROP OWNED BY %I;', rolname)`,
      `FROM pg_catalog.pg_roles WHERE rolname = ${literal}`,
      '\\gexec',
      `SELECT format('DROP ROLE %I;', rolname)`,
      `FROM pg_catalog.pg_roles WHERE rolname = ${literal}`,
      '\\gexec',
    ];
  });
  const statements = [
    '\\set ON_ERROR_STOP on',
    "SET statement_timeout = 0;",
    "SET lock_timeout = '5min';",
    ...APPLICATION_SCHEMAS.map((schema) => `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`),
    ...roleCleanupStatements,
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
  };
}

export function buildRestoreCleanupSqlWithRoles(dataDump, roleDump) {
  const internalTables = new Set();
  for (const line of String(dataDump).split(/\r?\n/)) addInternalTable(line, internalTables);
  return buildRestoreCleanupSqlForTables(internalTables, roleDump);
}

export async function buildRestoreCleanupSqlFromFile(dataPath, roleDump = '') {
  const internalTables = new Set();
  const lines = createInterface({
    input: createReadStream(dataPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) addInternalTable(line, internalTables);
  return buildRestoreCleanupSqlForTables(internalTables, roleDump);
}

async function main() {
  const dataPath = process.argv[2];
  const outputPath = process.argv[3];
  const rolesPath = process.argv[4];
  if (!dataPath || !outputPath) throw new Error('data_and_output_paths_required');
  const result = await buildRestoreCleanupSqlFromFile(
    dataPath,
    rolesPath ? readFileSync(rolesPath, 'utf8') : '',
  );
  writeFileSync(outputPath, result.sql, 'utf8');
  console.log(JSON.stringify({
    schemaVersion: 'stackr-restore-cleanup-v1.3.0',
    droppedSchemaCount: result.droppedSchemaCount,
    droppedRoleCount: result.droppedRoleCount,
    truncatedTableCount: result.truncatedTableCount,
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`prepare_restore_cleanup_failed:${error.message}`);
    process.exitCode = 1;
  });
}
