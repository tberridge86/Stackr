import { createHash } from 'node:crypto';

// Equality qualifies restoration, not the safety of the source's policies.
export const RESTORE_APPLICATION_SCHEMAS = ['public', 'catalog', 'ingest', 'market', 'ml', 'api', 'audit', 'private'];
const SECURITY_SCHEMAS = [...RESTORE_APPLICATION_SCHEMAS, 'auth', 'storage'];
const AUTH_IDENTITY_TABLES = ['users', 'identities'];
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
function canonical(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const queries = {
  schemas: `select nspname as identity, pg_get_userbyid(nspowner) as owner
    from pg_namespace where nspname = any($1::text[])`,
  relations: `select n.nspname || '.' || c.relname as identity,
    c.relkind, pg_get_userbyid(c.relowner) as owner, c.relrowsecurity, c.relforcerowsecurity,
    array(select unnest(coalesce(c.reloptions, '{}')) order by 1) as options
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = any($1::text[]) and c.relkind in ('r','p','v','m','S','f')`,
  policies: `select n.nspname || '.' || c.relname || ':' || p.polname as identity,
    p.polcmd, p.polpermissive,
    array(select case when role_oid = 0 then 'PUBLIC' else pg_get_userbyid(role_oid)::text end
      from unnest(p.polroles) role_oid order by 1) as roles,
    pg_get_expr(p.polqual, p.polrelid) as using_expression,
    pg_get_expr(p.polwithcheck, p.polrelid) as check_expression
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace where n.nspname = any($1::text[])`,
  triggers: `select n.nspname || '.' || c.relname || ':' || t.tgname as identity,
      t.tgenabled, pg_get_triggerdef(t.oid, true) as definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname=any($1::text[]) and not t.tgisinternal`,
  databaseRoleSettings: `select case when s.setdatabase=0 then '*' else 'current_database' end
      || ':' || case when s.setrole=0 then 'PUBLIC' else pg_get_userbyid(s.setrole)::text end as identity,
      array(select unnest(s.setconfig) order by 1) as settings
    from pg_db_role_setting s where s.setdatabase=0
      or s.setdatabase=(select oid from pg_database where datname=current_database())`,
  functions: `select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as identity,
    pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proleakproof,
    array(select unnest(coalesce(p.proconfig, '{}')) order by 1) as settings,
    pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = any($1::text[]) and p.prokind in ('f','p')`,
  privileges: `with objects as (
      select 'schema:' || nspname as identity, coalesce(nspacl, acldefault('n', nspowner)) as acl
      from pg_namespace where nspname = any($1::text[])
      union all
      select 'relation:' || n.nspname || '.' || c.relname,
        coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 's'::"char" else 'r'::"char" end, c.relowner))
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = any($1::text[]) and c.relkind in ('r','p','v','m','S','f')
      union all
      select 'column:' || n.nspname || '.' || c.relname || '.' || a.attname, a.attacl
      from pg_attribute a join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = any($1::text[]) and a.attnum > 0 and not a.attisdropped and a.attacl is not null
      union all
      select 'function:' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
        coalesce(p.proacl, acldefault('f', p.proowner))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = any($1::text[]) and p.prokind in ('f','p')
    ) select o.identity || ':' || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end
        || ':' || pg_get_userbyid(a.grantor) || ':' || a.privilege_type as identity,
      a.is_grantable from objects o cross join lateral aclexplode(o.acl) a`,
  defaultPrivilegeObjects: `select pg_get_userbyid(d.defaclrole) || ':' || coalesce(n.nspname, '*') || ':' || d.defaclobjtype::text as identity,
      cardinality(d.defaclacl)=0 as empty_acl
    from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
    where d.defaclnamespace=0 or n.nspname=any($1::text[])`,
  defaultPrivileges: `select pg_get_userbyid(d.defaclrole) || ':' || coalesce(n.nspname, '*') || ':' || d.defaclobjtype::text
      || ':' || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee)::text end
      || ':' || pg_get_userbyid(a.grantor) || ':' || a.privilege_type as identity, a.is_grantable
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclnamespace = 0 or n.nspname = any($1::text[])`,
  roles: `select rolname as identity, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
      rolcanlogin, rolreplication, rolbypassrls, rolconnlimit, extract(epoch from rolvaliduntil)::text as valid_until_epoch,
      array(select unnest(coalesce(rolconfig, '{}')) order by 1) as settings
    from pg_roles where rolname !~ '^pg_'`,
  memberships: `select pg_get_userbyid(roleid) || ':' || pg_get_userbyid(member) || ':' || pg_get_userbyid(grantor) as identity,
      admin_option, inherit_option, set_option from pg_auth_members`,
};
function normalizedRows(rows) {
  const normalized = rows.map(canonical).sort((a, b) => a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0);
  if (new Set(normalized.map((row) => row.identity)).size !== normalized.length) throw new Error('restore_security_duplicate_identity');
  return normalized;
}
export async function captureRestoreSecurity(client) {
  try {
    const { rows } = await client.query("select current_setting('row_security') as row_security");
    if (rows[0]?.row_security !== 'off') throw new Error('filtered_fingerprint');
  } catch {
    throw new Error('restore_security_requires_row_security_off');
  }
  const snapshot = {};
  for (const [category, sql] of Object.entries(queries)) {
    try {
      const { rows } = await client.query(sql, sql.includes('$1') ? [SECURITY_SCHEMAS] : []);
      snapshot[category] = normalizedRows(rows);
    } catch {
      // Driver errors can contain SQL, connection data or Auth values.
      throw new Error('restore_security_query_failed:' + category);
    }
  }
  for (const schema of ['public', 'private', 'auth', 'storage']) {
    if (!snapshot.schemas.some((row) => row.identity === schema)) throw new Error('restore_security_required_schema_missing:' + schema);
  }
  snapshot.authIdentities = [];
  for (const table of AUTH_IDENTITY_TABLES) {
    try {
      // Every column is hashed in the database; no account identifiers or raw
      // values cross the query boundary. Login/MFA/session recovery is separate.
      const { rows } = await client.query('select count(*)::text as row_count, ' +
        "md5(coalesce(string_agg(row_hash, '' order by row_hash), '')) as content_digest " +
        'from (select md5(to_jsonb(identity_row)::text) as row_hash from auth.' + quote(table) + ' identity_row) hashed');
      if (rows.length !== 1) throw new Error('invalid_auth_digest');
      snapshot.authIdentities.push({ identity: 'auth.' + table, ...rows[0] });
    } catch {
      throw new Error('restore_security_query_failed:auth.' + table);
    }
  }
  return snapshot;
}
export function compareRestoreSecurity(source, restore) {
  const categories = {};
  for (const category of [...Object.keys(queries), 'authIdentities']) {
    if (!Array.isArray(source[category]) || !Array.isArray(restore[category])) throw new Error('restore_security_snapshot_missing:' + category);
    const left = normalizedRows(source[category]);
    const right = normalizedRows(restore[category]);
    const sourceMap = new Map(left.map((row) => [row.identity, hash(row)]));
    const restoreMap = new Map(right.map((row) => [row.identity, hash(row)]));
    const mismatches = [...new Set([...sourceMap.keys(), ...restoreMap.keys()])].sort()
      .filter((name) => sourceMap.get(name) !== restoreMap.get(name));
    categories[category] = { sourceCount: left.length, restoreCount: right.length,
      sourceSha256: hash(left), restoreSha256: hash(right), mismatches, ok: mismatches.length === 0 };
  }
  return { schemaVersion: 'stackr-restore-security-v1', categories,
    ok: Object.values(categories).every((category) => category.ok),
    scope: { applicationSchemas: RESTORE_APPLICATION_SCHEMAS, securitySchemas: SECURITY_SCHEMAS,
      authIdentityTables: AUTH_IDENTITY_TABLES.map((table) => 'auth.' + table),
      installedAppLogin: 'not_verified', mfaAndSessionRecovery: 'not_verified',
      storageObjectsBucketsAndDelivery: 'separate_verification_required',
      targetManagedRoleDifferences: 'fail_closed_and_require_explicit_review_no_automatic_waivers',
      sourcePolicySafety: 'equality_does_not_establish_safety' } };
}
