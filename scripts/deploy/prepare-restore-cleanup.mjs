import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const APPLICATION_SCHEMAS = ['catalog', 'ingest', 'market', 'ml', 'api', 'audit', 'public'];

function decodeIdentifier(value) {
  return value.replaceAll('""', '"');
}

export function buildRestoreCleanupSql(dataDump) {
  return buildRestoreCleanupSqlWithRoles(dataDump, '');
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

export function buildRestoreCleanupSqlWithRoles(dataDump, roleDump) {
  const internalTables = new Set();
  for (const line of String(dataDump).split(/\r?\n/)) {
    const match = line.match(/^COPY\s+("((?:[^"]|"")+)"\."((?:[^"]|"")+)")\s+\(/);
    if (!match) continue;
    const schema = decodeIdentifier(match[2]);
    if (!APPLICATION_SCHEMAS.includes(schema) && schema !== 'supabase_migrations') {
      internalTables.add(match[1]);
    }
  }

  const applicationRoles = applicationRolesFromDump(roleDump);
  const statements = [
    '\\set ON_ERROR_STOP on',
    ...APPLICATION_SCHEMAS.map((schema) => `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`),
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
  };
}

function main() {
  const dataPath = process.argv[2];
  const outputPath = process.argv[3];
  const rolesPath = process.argv[4];
  if (!dataPath || !outputPath) throw new Error('data_and_output_paths_required');
  const result = buildRestoreCleanupSqlWithRoles(
    readFileSync(dataPath, 'utf8'),
    rolesPath ? readFileSync(rolesPath, 'utf8') : '',
  );
  writeFileSync(outputPath, result.sql, 'utf8');
  console.log(JSON.stringify({
    schemaVersion: 'stackr-restore-cleanup-v1.1.0',
    droppedSchemaCount: result.droppedSchemaCount,
    droppedRoleCount: result.droppedRoleCount,
    truncatedTableCount: result.truncatedTableCount,
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`prepare_restore_cleanup_failed:${error.message}`);
    process.exitCode = 1;
  }
}
