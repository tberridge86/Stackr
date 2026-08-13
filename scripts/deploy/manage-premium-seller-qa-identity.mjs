import { pathToFileURL } from 'node:url';
import { normalizePostgresUrl } from './prepare-postgres-urls.mjs';
import {
  assertPremiumSellerMigrationInstalled,
  assertPremiumSellerRuntimeContract,
  loadReviewedAtomicSellerImplementationContract,
  loadReviewedPremiumSellerWrapperContract,
} from './set-premium-seller-runtime.mjs';

export const PREMIUM_SELLER_QA_PROJECT_REF = 'oakdbbzdqwurpjnoqhmu';
export const PREMIUM_SELLER_QA_SUPABASE_URL = `https://${PREMIUM_SELLER_QA_PROJECT_REF}.supabase.co`;
export const PREMIUM_SELLER_QA_REDIRECT_URL = 'stackr-staging://auth/callback';
export const PREMIUM_SELLER_QA_MARKER = Object.freeze({
  managed: true,
  purpose: 'premium_seller_release_smoke',
  environment: 'production',
  schema_version: 1,
});

const ACTIONS = Object.freeze({
  preflight: Object.freeze({
    confirmation: 'PREFLIGHT PREMIUM SELLER QA IDENTITY',
    successMessage: 'Premium Seller QA identity preflight passed.',
  }),
  provision: Object.freeze({
    confirmation: 'PROVISION PREMIUM SELLER QA IDENTITY',
    successMessage: 'Premium Seller QA identity provisioned.',
  }),
  send_magic_link: Object.freeze({
    confirmation: 'SEND PREMIUM SELLER QA MAGIC LINK',
    successMessage: 'Premium Seller QA magic link requested.',
  }),
});
const ALLOWED_APP_METADATA_KEYS = new Set([
  'provider',
  'providers',
  'stackr_premium_seller',
  'stackr_release_qa',
  'stackr_release_sha',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

class SafeQaIdentityError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SafeQaIdentityError';
    this.safeCode = code;
  }
}

function fail(code) {
  throw new SafeQaIdentityError(code);
}

function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactJson(actual, expected) {
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return Array.isArray(actual)
      && Array.isArray(expected)
      && actual.length === expected.length
      && actual.every((value, index) => exactJson(value, expected[index]));
  }
  if (!isPlainObject(actual) || !isPlainObject(expected)) return false;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return exactJson(actualKeys, expectedKeys)
    && actualKeys.every((key) => exactJson(actual[key], expected[key]));
}

function requiredSecret(value, failureCode) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value || /[\r\n]/.test(value)) {
    fail(failureCode);
  }
  return value;
}

export function normalizeQaEmail(value) {
  const email = requiredSecret(value, 'premium_seller_qa_email_invalid');
  const normalized = email.toLowerCase();
  if (
    normalized.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) fail('premium_seller_qa_email_invalid');
  return normalized;
}

export function resolvePremiumSellerQaIdentityRequest({
  action,
  confirmation,
  releaseSha,
  workflowSha,
  expectedCommitSha,
}) {
  const normalizedAction = String(action ?? '').trim();
  const contract = ACTIONS[normalizedAction];
  if (!contract) fail('premium_seller_qa_action_invalid');
  if (String(confirmation ?? '') !== contract.confirmation) {
    fail('premium_seller_qa_confirmation_mismatch');
  }
  if (!SHA_PATTERN.test(String(releaseSha ?? ''))) fail('premium_seller_qa_release_sha_invalid');
  if (!SHA_PATTERN.test(String(workflowSha ?? ''))) fail('premium_seller_qa_workflow_sha_invalid');
  if (String(expectedCommitSha ?? '') !== workflowSha) {
    fail('premium_seller_qa_expected_commit_mismatch');
  }
  return { action: normalizedAction, releaseSha, ...contract };
}

export function expectedPremiumSellerQaAppMetadata(releaseSha, providerMetadata) {
  if (!SHA_PATTERN.test(String(releaseSha ?? ''))) fail('premium_seller_qa_release_sha_invalid');
  if (!isPlainObject(providerMetadata)) fail('premium_seller_qa_provider_metadata_invalid');
  const provider = providerMetadata.provider;
  const providers = providerMetadata.providers;
  if (provider !== 'email' || !exactJson(providers, ['email'])) {
    fail('premium_seller_qa_provider_metadata_invalid');
  }
  return {
    provider,
    providers: [...providers],
    stackr_premium_seller: true,
    stackr_release_qa: { ...PREMIUM_SELLER_QA_MARKER },
    stackr_release_sha: releaseSha,
  };
}

export function assertManagedPremiumSellerQaIdentity(user, {
  email,
  releaseSha,
  requireConfirmed = false,
} = {}) {
  if (!isPlainObject(user) || !UUID_PATTERN.test(String(user.id ?? ''))) {
    fail('premium_seller_qa_identity_invalid');
  }
  if (String(user.email ?? '').toLowerCase() !== email) fail('premium_seller_qa_identity_invalid');
  if (user.aud !== 'authenticated' || user.role !== 'authenticated') {
    fail('premium_seller_qa_identity_role_invalid');
  }
  if (user.deleted_at) fail('premium_seller_qa_identity_invalid');
  if (user.is_anonymous === true) fail('premium_seller_qa_identity_invalid');
  if (user.is_sso_user === true) fail('premium_seller_qa_identity_provider_invalid');
  if (
    !Array.isArray(user.identities)
    || user.identities.length !== 1
    || user.identities[0]?.provider !== 'email'
    || user.identities[0]?.user_id !== user.id
  ) fail('premium_seller_qa_identity_provider_invalid');

  const metadata = user.app_metadata;
  if (!isPlainObject(metadata)) fail('premium_seller_qa_identity_unmanaged');
  if (Object.keys(metadata).some((key) => !ALLOWED_APP_METADATA_KEYS.has(key))) {
    fail('premium_seller_qa_identity_unmanaged');
  }
  const existingReleaseSha = metadata.stackr_release_sha;
  if (!SHA_PATTERN.test(String(existingReleaseSha ?? ''))) {
    fail('premium_seller_qa_identity_unmanaged');
  }
  if (existingReleaseSha !== releaseSha) {
    fail('premium_seller_qa_identity_release_mismatch');
  }
  const expected = expectedPremiumSellerQaAppMetadata(existingReleaseSha, {
    provider: metadata.provider,
    providers: metadata.providers,
  });
  if (!exactJson(metadata, expected)) fail('premium_seller_qa_identity_unmanaged');
  if (requireConfirmed && !(user.email_confirmed_at || user.confirmed_at)) {
    fail('premium_seller_qa_identity_not_confirmed');
  }
  if (user.banned_until) {
    const bannedUntil = Date.parse(user.banned_until);
    if (!Number.isFinite(bannedUntil) || bannedUntil > Date.now()) {
      fail('premium_seller_qa_identity_banned');
    }
  }
  return {
    provider: metadata.provider,
    providers: [...metadata.providers],
  };
}

export function assertHostedPremiumSellerQaAuthConfig(config) {
  if (!isPlainObject(config) || config.external_email_enabled !== true) {
    fail('premium_seller_qa_hosted_auth_config_invalid');
  }
  if (typeof config.uri_allow_list !== 'string') {
    fail('premium_seller_qa_hosted_auth_config_invalid');
  }
  const redirects = config.uri_allow_list.split(',').map((value) => value.trim()).filter(Boolean);
  if (!redirects.includes(PREMIUM_SELLER_QA_REDIRECT_URL)) {
    fail('premium_seller_qa_redirect_not_allowed');
  }
}

export function assertPublicPremiumSellerQaAuthSettings(settings) {
  if (!isPlainObject(settings) || !isPlainObject(settings.external) || settings.external.email !== true) {
    fail('premium_seller_qa_public_auth_settings_invalid');
  }
}

export function safePremiumSellerQaIdentityFailureCode(error) {
  if (error instanceof SafeQaIdentityError) return error.safeCode;
  const knownGuardFailures = new Set([
    'invalid_database_url',
    'invalid_database_url_scheme',
    'invalid_database_url_credentials',
    'unsafe_postgres_connection_parameter:host',
    'unsafe_postgres_connection_parameter:hostaddr',
    'unsafe_postgres_connection_parameter:port',
    'unsafe_postgres_connection_parameter:user',
    'unsafe_postgres_connection_parameter:password',
    'unsafe_postgres_connection_parameter:dbname',
    'unsafe_postgres_connection_parameter:database',
    'unsafe_postgres_connection_parameter:service',
    'unsafe_postgres_connection_parameter:options',
    'database_url_project_mismatch',
    'database_url_role_mismatch',
    'database_url_host_mismatch',
    'database_url_password_missing',
  ]);
  return knownGuardFailures.has(error?.message)
    ? error.message
    : 'premium_seller_qa_identity_operation_failed';
}

async function fetchJson(url, init, failureCode) {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) fail(failureCode);
    const result = await response.json();
    if (!isPlainObject(result)) fail(failureCode);
    return result;
  } catch (error) {
    if (error instanceof SafeQaIdentityError) throw error;
    fail(failureCode);
  }
}

function boundedFetch(input, init = {}) {
  const timeoutSignal = AbortSignal.timeout(15_000);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, { ...init, signal });
}

async function verifyHostedAuthConfiguration({ accessToken, publishableKey }) {
  const hostedConfig = await fetchJson(
    `https://api.supabase.com/v1/projects/${PREMIUM_SELLER_QA_PROJECT_REF}/config/auth`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
    },
    'premium_seller_qa_hosted_auth_config_unavailable',
  );
  assertHostedPremiumSellerQaAuthConfig(hostedConfig);

  const publicSettings = await fetchJson(
    `${PREMIUM_SELLER_QA_SUPABASE_URL}/auth/v1/settings`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        apikey: publishableKey,
      },
    },
    'premium_seller_qa_public_auth_settings_unavailable',
  );
  assertPublicPremiumSellerQaAuthSettings(publicSettings);
}

export function selectSolePremiumSellerQaIdentity(users, email) {
  if (!Array.isArray(users)) fail('premium_seller_qa_identity_lookup_failed');
  const emailMatches = [];
  const premiumMetadataUsers = [];
  const qaMarkerUsers = [];
  for (const user of users) {
    if (!isPlainObject(user)) fail('premium_seller_qa_identity_lookup_failed');
    if (String(user.email ?? '').toLowerCase() === email) emailMatches.push(user);
    const metadata = user.app_metadata;
    if (isPlainObject(metadata)) {
      if (Object.hasOwn(metadata, 'stackr_premium_seller')) premiumMetadataUsers.push(user);
      if (Object.hasOwn(metadata, 'stackr_release_qa')) qaMarkerUsers.push(user);
    }
  }
  if (emailMatches.length > 1) fail('premium_seller_qa_identity_duplicate');
  const target = emailMatches[0] ?? null;
  const targetId = target?.id;
  if (
    premiumMetadataUsers.some((user) => user.id !== targetId)
    || qaMarkerUsers.some((user) => user.id !== targetId)
  ) fail('premium_seller_qa_global_identity_collision');
  return target;
}

async function findQaIdentity(admin, email) {
  const users = [];
  const perPage = 1_000;
  for (let page = 1; page <= 10_000; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error || !Array.isArray(data?.users)) fail('premium_seller_qa_identity_lookup_failed');
    users.push(...data.users);
    if (data.users.length < perPage) break;
    if (page === 10_000) fail('premium_seller_qa_identity_lookup_incomplete');
  }
  return selectSolePremiumSellerQaIdentity(users, email);
}

async function getQaIdentityById(admin, id) {
  const { data, error } = await admin.getUserById(id);
  if (error || !isPlainObject(data?.user)) fail('premium_seller_qa_identity_readback_failed');
  return data.user;
}

export async function provisionPremiumSellerQaIdentity({ admin, email, releaseSha, existingUser }) {
  let user;
  if (existingUser) {
    const current = await getQaIdentityById(admin, existingUser.id);
    assertManagedPremiumSellerQaIdentity(current, {
      email,
      releaseSha,
      requireConfirmed: true,
    });
    user = current;
  } else {
    const { data, error } = await admin.createUser({
      email,
      email_confirm: true,
      app_metadata: {
        stackr_premium_seller: true,
        stackr_release_qa: { ...PREMIUM_SELLER_QA_MARKER },
        stackr_release_sha: releaseSha,
      },
    });
    if (error || !isPlainObject(data?.user)) fail('premium_seller_qa_identity_provision_failed');
    user = data.user;
  }

  const readback = await getQaIdentityById(admin, user.id);
  assertManagedPremiumSellerQaIdentity(readback, {
    email,
    releaseSha,
    requireConfirmed: true,
  });
  return readback;
}

export async function sendPremiumSellerQaMagicLink({ publicClient, admin, email, releaseSha, existingUser }) {
  if (!existingUser) fail('premium_seller_qa_identity_missing');
  const before = await getQaIdentityById(admin, existingUser.id);
  assertManagedPremiumSellerQaIdentity(before, {
    email,
    releaseSha,
    requireConfirmed: true,
  });
  const { error } = await publicClient.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: PREMIUM_SELLER_QA_REDIRECT_URL,
    },
  });
  if (error) fail('premium_seller_qa_magic_link_failed');
  const after = await getQaIdentityById(admin, existingUser.id);
  assertManagedPremiumSellerQaIdentity(after, {
    email,
    releaseSha,
    requireConfirmed: true,
  });
}

async function assertSellerDataBoundaryContract(client) {
  const result = await client.query(`
    with seller_policies as (
      select
        count(*)::int as policy_count,
        count(*) filter (where policy.polcmd = 'r')::int as read_policy_count
      from pg_policy policy
      join pg_class table_rel on table_rel.oid = policy.polrelid
      join pg_namespace table_schema on table_schema.oid = table_rel.relnamespace
      where table_schema.nspname = 'public'
        and table_rel.relname in (
          'seller_inventory_items',
          'inventory_movements',
          'seller_sale_transactions',
          'seller_sale_transaction_items'
        )
    )
    select
      (select bool_and(table_rel.relrowsecurity)
       from pg_class table_rel
       join pg_namespace table_schema on table_schema.oid = table_rel.relnamespace
       where table_schema.nspname = 'public'
         and table_rel.relname in (
           'seller_inventory_items',
           'inventory_movements',
           'seller_sale_transactions',
           'seller_sale_transaction_items'
         )) as seller_tables_rls_enabled,
      (select relrowsecurity
       from pg_class
       where oid = 'private.seller_inventory_batch_commits'::regclass) as receipt_rls_enabled,
      has_table_privilege('authenticated', 'public.seller_inventory_items', 'SELECT')
        and not has_table_privilege('authenticated', 'public.seller_inventory_items', 'INSERT')
        and not has_table_privilege('authenticated', 'public.seller_inventory_items', 'UPDATE')
        and not has_table_privilege('authenticated', 'public.seller_inventory_items', 'DELETE')
        and not has_table_privilege('authenticated', 'public.seller_inventory_items', 'TRUNCATE')
        as inventory_owner_read_only,
      has_table_privilege('authenticated', 'public.inventory_movements', 'SELECT')
        and not has_table_privilege('authenticated', 'public.inventory_movements', 'INSERT')
        and not has_table_privilege('authenticated', 'public.inventory_movements', 'UPDATE')
        and not has_table_privilege('authenticated', 'public.inventory_movements', 'DELETE')
        and not has_table_privilege('authenticated', 'public.inventory_movements', 'TRUNCATE')
        as movements_owner_read_only,
      has_table_privilege('authenticated', 'public.seller_sale_transactions', 'SELECT')
        and not has_table_privilege('authenticated', 'public.seller_sale_transactions', 'INSERT')
        and not has_table_privilege('authenticated', 'public.seller_sale_transactions', 'UPDATE')
        and not has_table_privilege('authenticated', 'public.seller_sale_transactions', 'DELETE')
        and not has_table_privilege('authenticated', 'public.seller_sale_transactions', 'TRUNCATE')
        as sales_owner_read_only,
      has_table_privilege('authenticated', 'public.seller_sale_transaction_items', 'SELECT')
        and not has_table_privilege('authenticated', 'public.seller_sale_transaction_items', 'INSERT')
        and not has_table_privilege('authenticated', 'public.seller_sale_transaction_items', 'UPDATE')
        and not has_table_privilege('authenticated', 'public.seller_sale_transaction_items', 'DELETE')
        and not has_table_privilege('authenticated', 'public.seller_sale_transaction_items', 'TRUNCATE')
        as sale_items_owner_read_only,
      has_table_privilege('authenticated', 'private.seller_inventory_batch_commits', 'SELECT')
        and not has_table_privilege('authenticated', 'private.seller_inventory_batch_commits', 'INSERT')
        and not has_table_privilege('authenticated', 'private.seller_inventory_batch_commits', 'UPDATE')
        and not has_table_privilege('authenticated', 'private.seller_inventory_batch_commits', 'DELETE')
        and not has_table_privilege('authenticated', 'private.seller_inventory_batch_commits', 'TRUNCATE')
        as receipts_owner_read_only,
      exists (
        select 1 from pg_policy policy
        where policy.polrelid = 'private.seller_inventory_batch_commits'::regclass
          and policy.polcmd = 'r'
      ) and not exists (
        select 1 from pg_policy policy
        where policy.polrelid = 'private.seller_inventory_batch_commits'::regclass
          and policy.polcmd <> 'r'
      ) as receipts_have_only_read_policy,
      not has_sequence_privilege(
        'authenticated',
        'public.seller_sale_transaction_items_id_seq',
        'USAGE'
      ) as sale_sequence_restricted,
      seller_policies.policy_count = 4
        and seller_policies.read_policy_count = 4 as seller_policies_read_only
    from seller_policies
  `);
  const row = result.rows[0];
  if (
    result.rowCount !== 1
    || row?.seller_tables_rls_enabled !== true
    || row?.receipt_rls_enabled !== true
    || row?.inventory_owner_read_only !== true
    || row?.movements_owner_read_only !== true
    || row?.sales_owner_read_only !== true
    || row?.sale_items_owner_read_only !== true
    || row?.receipts_owner_read_only !== true
    || row?.receipts_have_only_read_policy !== true
    || row?.sale_sequence_restricted !== true
    || row?.seller_policies_read_only !== true
  ) fail('premium_seller_qa_data_boundary_contract_mismatch');
}

async function assertRuntimeDisabledAndLedgersEmpty(client) {
  const result = await client.query(`
    select
      (select count(*)::int from private.premium_seller_runtime_control) as runtime_row_count,
      (select count(*)::int
       from private.premium_seller_runtime_control
       where singleton and writes_enabled = false) as disabled_singleton_count,
      not exists (
        select 1 from public.seller_inventory_items
        union all
        select 1 from public.inventory_movements
        union all
        select 1 from public.seller_sale_transactions
        union all
        select 1 from public.seller_sale_transaction_items
        union all
        select 1 from private.seller_inventory_batch_commits
      ) as seller_ledgers_empty
  `);
  const row = result.rows[0];
  if (result.rowCount !== 1 || row?.runtime_row_count !== 1 || row?.disabled_singleton_count !== 1) {
    fail('premium_seller_qa_requires_disabled_runtime');
  }
  if (row?.seller_ledgers_empty !== true) fail('premium_seller_qa_requires_empty_ledgers');
}

async function withPremiumSellerQaDatabaseGuards(connectionString, operation) {
  const expectedWrapperSource = loadReviewedPremiumSellerWrapperContract();
  const expectedImplementationSource = loadReviewedAtomicSellerImplementationContract();
  const { normalized } = normalizePostgresUrl(connectionString, PREMIUM_SELLER_QA_PROJECT_REF);
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    connectionString: normalized,
    application_name: 'stackr_premium_seller_qa_identity',
    connectionTimeoutMillis: 10_000,
    query_timeout: 30_000,
  });
  await client.connect();
  let transactionOpen = false;
  try {
    await client.query('begin');
    transactionOpen = true;
    await client.query("set local lock_timeout = '10s'");
    await client.query("set local statement_timeout = '30s'");
    await client.query("select pg_advisory_xact_lock(hashtext('stackr.premium_seller_runtime_control'))");
    try {
      await assertPremiumSellerMigrationInstalled(client);
      await assertPremiumSellerRuntimeContract(
        client,
        expectedWrapperSource,
        expectedImplementationSource,
      );
    } catch {
      fail('premium_seller_qa_runtime_contract_mismatch');
    }
    await assertSellerDataBoundaryContract(client);
    const runtimeLock = await client.query(`
      select writes_enabled
      from private.premium_seller_runtime_control
      where singleton
      for update
    `);
    if (runtimeLock.rowCount !== 1 || runtimeLock.rows[0]?.writes_enabled !== false) {
      fail('premium_seller_qa_requires_disabled_runtime');
    }
    await assertRuntimeDisabledAndLedgersEmpty(client);
    await operation();
    await assertRuntimeDisabledAndLedgersEmpty(client);
    await client.query('commit');
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('rollback');
      } catch {
        // Preserve the original safe failure classification.
      }
    }
    throw error;
  } finally {
    await client.end();
  }
}

export async function managePremiumSellerQaIdentity({
  request,
  email,
  connectionString,
  accessToken,
  secretKey,
  publishableKey,
}) {
  const normalizedEmail = normalizeQaEmail(email);
  const normalizedAccessToken = requiredSecret(accessToken, 'premium_seller_qa_access_token_missing');
  const normalizedSecretKey = requiredSecret(secretKey, 'premium_seller_qa_secret_key_missing');
  const normalizedPublishableKey = requiredSecret(
    publishableKey,
    'premium_seller_qa_publishable_key_missing',
  );
  await verifyHostedAuthConfiguration({
    accessToken: normalizedAccessToken,
    publishableKey: normalizedPublishableKey,
  });

  const { createClient } = await import('@supabase/supabase-js');
  const adminClient = createClient(PREMIUM_SELLER_QA_SUPABASE_URL, normalizedSecretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { fetch: boundedFetch },
  });
  const publicClient = createClient(PREMIUM_SELLER_QA_SUPABASE_URL, normalizedPublishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { fetch: boundedFetch },
  });
  const existingCandidate = await findQaIdentity(adminClient.auth.admin, normalizedEmail);
  const existingUser = existingCandidate
    ? await getQaIdentityById(adminClient.auth.admin, existingCandidate.id)
    : null;
  if (existingUser) {
    assertManagedPremiumSellerQaIdentity(existingUser, {
      email: normalizedEmail,
      releaseSha: request.releaseSha,
      requireConfirmed: true,
    });
  }

  await withPremiumSellerQaDatabaseGuards(connectionString, async () => {
    if (request.action === 'preflight') return;
    if (request.action === 'provision') {
      const provisioned = await provisionPremiumSellerQaIdentity({
        admin: adminClient.auth.admin,
        email: normalizedEmail,
        releaseSha: request.releaseSha,
        existingUser,
      });
      const globalCandidate = await findQaIdentity(adminClient.auth.admin, normalizedEmail);
      if (!globalCandidate || globalCandidate.id !== provisioned.id) {
        fail('premium_seller_qa_identity_readback_failed');
      }
      const globallyVerified = await getQaIdentityById(adminClient.auth.admin, globalCandidate.id);
      assertManagedPremiumSellerQaIdentity(globallyVerified, {
        email: normalizedEmail,
        releaseSha: request.releaseSha,
        requireConfirmed: true,
      });
      return;
    }
    await sendPremiumSellerQaMagicLink({
      publicClient,
      admin: adminClient.auth.admin,
      email: normalizedEmail,
      releaseSha: request.releaseSha,
      existingUser,
    });
  });
}

async function main() {
  const request = resolvePremiumSellerQaIdentityRequest({
    action: process.env.STACKR_PREMIUM_SELLER_QA_ACTION,
    confirmation: process.env.STACKR_PREMIUM_SELLER_QA_CONFIRMATION,
    releaseSha: process.env.STACKR_RELEASE_SHA,
    workflowSha: process.env.STACKR_WORKFLOW_SHA,
    expectedCommitSha: process.env.STACKR_EXPECTED_COMMIT_SHA,
  });
  if (process.argv.includes('--validate-request')) {
    console.log('Premium Seller QA identity request validated.');
    return;
  }
  await managePremiumSellerQaIdentity({
    request,
    email: process.env.PREMIUM_SELLER_QA_EMAIL,
    connectionString: process.env.STACKR_SOURCE_DB_URL,
    accessToken: process.env.SUPABASE_ACCESS_TOKEN,
    secretKey: process.env.SUPABASE_PRODUCTION_SECRET_KEY,
    publishableKey: process.env.STACKR_SUPABASE_PUBLISHABLE_KEY,
  });
  console.log(request.successMessage);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`premium_seller_qa_identity_failed:${safePremiumSellerQaIdentityFailureCode(error)}`);
    process.exitCode = 1;
  });
}
