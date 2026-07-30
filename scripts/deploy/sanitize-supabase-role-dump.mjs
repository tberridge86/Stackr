import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const RESERVED_ROLE_PATTERNS = [
  /^(?:anon|authenticated|authenticator|dashboard_user|pgbouncer|postgres|service_role)$/,
  /^cli_login_.*/,
  /^supabase_.*/,
  /^(?:pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)$/,
];

function isReservedRole(role) {
  return RESERVED_ROLE_PATTERNS.some((pattern) => pattern.test(role));
}

function quotedIdentifiers(statement) {
  return [...statement.matchAll(/"((?:[^"]|"")*)"/g)]
    .map((match) => match[1].replaceAll('""', '"'));
}

function targetsReservedRole(statement) {
  const command = statement.match(/^\s*(CREATE|ALTER|DROP|COMMENT ON)\s+ROLE\b/i);
  if (command) {
    const [role] = quotedIdentifiers(statement);
    return Boolean(role && isReservedRole(role));
  }

  if (/^\s*(GRANT|REVOKE)\b/i.test(statement)) {
    return quotedIdentifiers(statement).some(isReservedRole);
  }

  return false;
}

export function sanitizeRoleDumpText(input) {
  let removedStatementCount = 0;
  const output = String(input).split(/\r?\n/).map((line) => {
    if (line.startsWith('-- STACKR_RESERVED_ROLE:')) return line;
    if (!targetsReservedRole(line)) return line;
    removedStatementCount += 1;
    return `-- STACKR_RESERVED_ROLE: ${line}`;
  }).join('\n');
  return { output, removedStatementCount };
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error('role_dump_path_required');
  const result = sanitizeRoleDumpText(readFileSync(filePath, 'utf8'));
  writeFileSync(filePath, result.output, 'utf8');
  console.log(JSON.stringify({
    schemaVersion: 'stackr-role-dump-sanitizer-v1.0.0',
    removedStatementCount: result.removedStatementCount,
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`sanitize_role_dump_failed:${error.message}`);
    process.exitCode = 1;
  }
}
