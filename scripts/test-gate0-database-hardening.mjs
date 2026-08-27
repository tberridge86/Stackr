import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  EXCLUDED_SYNTHETIC_FIXTURE,
  loadStagingMigrationLedger,
  singleStatementRemoteSha256,
  verifyGate0RemoteStatementContract,
} from './deploy/staging-migration-ledger.mjs';
import {
  assertRollbackSafeMigrationSql,
  findUnsafeTopLevelMigrationStatements,
  UnsafeMigrationSqlError,
} from './deploy/migration-transaction-safety.mjs';
import {
  expectedProtectedFunctionAclMatrix,
  findUnsafeFinancialStateCounts,
  hasExactPolicyRoles,
  requiresPreApplySenderOwnershipBaseline,
  verifyAuthenticatedProfileAclMatrix,
  verifyGlobalFunctionDefaultContracts,
  verifyCatalog,
  verifyCatalogCardTradeAssociations,
  verifyProbeRestorationResult,
  verifyProtectedFunctionAclMatrix,
} from './deploy/verify-gate0-financial-route-containment.mjs';

const read = (file) => readFileSync(file, 'utf8');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const gate0MigrationPath =
  'supabase/migrations/20260827124944_gate0_financial_route_containment.sql';
const emergencyMigrationPath =
  'supabase/migrations/20260827093110_emergency_client_write_containment.sql';
const gate0Migration = read(gate0MigrationPath);
const emergencyMigration = readFileSync(emergencyMigrationPath);
const liveEmergencyOverride = readFileSync(
  'supabase/staging-migrations/overrides/20260827093108_emergency_client_write_containment.sql',
);

assert.equal(
  hasExactPolicyRoles({ roles: ['authenticated'] }, ['authenticated']),
  true,
  'text[] policy roles must be accepted as a parsed array',
);
assert.equal(
  hasExactPolicyRoles({ roles: '{authenticated}' }, ['authenticated']),
  false,
  'an unparsed name[] driver string must fail closed rather than mimic an array',
);
assert.equal(
  hasExactPolicyRoles(
    { roles: ['authenticated', 'anon'] },
    ['anon', 'authenticated'],
  ),
  true,
  'policy role order is not semantically significant',
);

const safeAuthenticatedProfileAcl = [
  ['id', 'UPDATE'],
  ['email', 'INSERT'],
  ['email', 'UPDATE'],
  ['role', 'INSERT'],
  ['role', 'UPDATE'],
  ['stripe_account_id', 'INSERT'],
  ['stripe_account_id', 'UPDATE'],
].map(([column_name, privilege_name]) => ({
  column_name,
  privilege_name,
  allowed: false,
}));
assert.deepEqual(
  verifyAuthenticatedProfileAclMatrix(safeAuthenticatedProfileAcl),
  [],
);
assert.ok(
  verifyAuthenticatedProfileAclMatrix(
    safeAuthenticatedProfileAcl.map((row) => (
      row.column_name === 'role' && row.privilege_name === 'UPDATE'
        ? { ...row, allowed: true }
        : row
    )),
  ).includes('gate0_authenticated_profile_column_privilege:role:UPDATE'),
  'authenticated role self-promotion must fail the post-apply ACL proof',
);
assert.ok(
  verifyAuthenticatedProfileAclMatrix(safeAuthenticatedProfileAcl.slice(1))
    .includes('gate0_authenticated_profile_acl_matrix_incomplete'),
  'a missing protected profile ACL row must fail closed',
);

const deniedTransactionStatements = [
  'begin',
  'start transaction',
  'savepoint gate0_probe',
  'release savepoint gate0_probe',
  "prepare transaction 'gate0_probe'",
  'set transaction isolation level serializable',
  'commit',
  "commit prepared 'gate0_probe'",
  'rollback',
  'rollback to savepoint gate0_probe',
  "rollback prepared 'gate0_probe'",
  'end',
  'abort',
];
const deniedNontransactionalStatements = [
  'create index concurrently gate0_idx on public.profiles (id)',
  'create unique index concurrently gate0_uidx on public.profiles (id)',
  'drop index concurrently gate0_idx',
  'reindex index concurrently gate0_idx',
  'reindex schema public',
  'reindex database postgres',
  'reindex system postgres',
  'vacuum public.profiles',
  "alter system set work_mem = '64MB'",
  'create database gate0_probe',
  'drop database gate0_probe',
  "create tablespace gate0_probe location '/tmp/gate0'",
  'drop tablespace gate0_probe',
  'call public.gate0_probe()',
];
for (const statement of [
  ...deniedTransactionStatements,
  ...deniedNontransactionalStatements,
]) {
  for (const hostileSql of [
    `${statement};`,
    `select 1; ${statement}; select 2;`,
    `/* attacker-controlled prefix */ ${statement};`,
    `-- attacker-controlled prefix\n${statement};`,
  ]) {
    const violations = findUnsafeTopLevelMigrationStatements(hostileSql);
    assert.equal(violations.length, 1, `unsafe statement escaped: ${hostileSql}`);
    assert.throws(
      () => assertRollbackSafeMigrationSql(hostileSql),
      (error) => error instanceof UnsafeMigrationSqlError
        && error.code === 'UNSAFE_MIGRATION_SQL'
        && error.violations.length === 1,
      `unsafe statement was accepted: ${hostileSql}`,
    );
  }
}

for (const allowedSql of [
  "select 'commit; rollback; begin; call public.dangerous()';",
  "select 'single quote '' end; abort; still literal';",
  'select "commit; rollback; begin";',
  '-- commit; rollback; call public.dangerous();\nselect 1;',
  '/* commit; /* nested rollback; */ abort; */ select 1;',
  `do $gate0$
   begin
     perform 'commit; rollback; call public.dangerous()';
   end;
   $gate0$;`,
  `create function public.gate0_quoted_body()
   returns void language plpgsql as $function$
   begin
     perform 'end; abort; commit; rollback';
   end;
   $function$;`,
  'prepare gate0_probe as select 1;',
  'set statement_timeout = 1000;',
  'set session characteristics as transaction isolation level serializable;',
  'create index gate0_idx on public.profiles (id);',
  'drop index gate0_idx;',
  'reindex index gate0_idx;',
]) {
  assert.deepEqual(
    findUnsafeTopLevelMigrationStatements(allowedSql),
    [],
    `safe SQL was rejected: ${allowedSql}`,
  );
  assert.doesNotThrow(() => assertRollbackSafeMigrationSql(allowedSql));
}

const restorationProof = Object.fromEntries([
  'role_restored',
  'claims_restored',
  'entitlement_restored',
  'offers_removed',
  'events_removed',
  'offer_cards_removed',
  'sender_owned_variants_removed',
  'card_flags_removed',
  'seller_inventory_removed',
  'seller_movements_removed',
  'seller_sales_removed',
  'seller_sale_items_removed',
  'seller_batches_removed',
  'receiver_entitlement_restored',
  'receiver_listings_removed',
  'trade_reviews_removed',
  'trader_ratings_removed',
  'sale_item_sequence_unchanged',
].map((contract) => [contract, true]));
assert.deepEqual(
  verifyProbeRestorationResult({ rowCount: 1, rows: [restorationProof] }),
  [],
);
assert.equal(
  requiresPreApplySenderOwnershipBaseline('pre-apply', false),
  true,
  'a pending migration must prove pre-existing sender ownership exactly once',
);
assert.equal(
  requiresPreApplySenderOwnershipBaseline('pre-apply', true),
  false,
  'a resumable pre-apply rerun after Gate 0 must allow legitimate later depletion',
);
assert.equal(requiresPreApplySenderOwnershipBaseline('post-apply', true), false);
assert.deepEqual(
  verifyProbeRestorationResult({ rowCount: 0, rows: [] }),
  ['gate0_probe_restoration_row_count_invalid'],
  'an empty restoration query result must fail closed',
);
assert.deepEqual(
  verifyProbeRestorationResult({
    rowCount: 1,
    rows: [{ ...restorationProof, offers_removed: false }],
  }),
  ['gate0_probe_cleanup_state_drift:offers_removed'],
);
const { claims_restored: _missingContract, ...incompleteRestorationProof } = restorationProof;
assert.deepEqual(
  verifyProbeRestorationResult({ rowCount: 1, rows: [incompleteRestorationProof] }),
  ['gate0_probe_restoration_contract_keys_invalid'],
  'restoration proof must return the exact expected contract keys',
);

assert.deepEqual(
  findUnsafeFinancialStateCounts({
    trade_offer_rows: 4,
    trade_offer_event_rows: 9,
    trade_offer_card_rows: 6,
    trade_listing_rows: 1,
    active_trade_listings: 1,
    archived_trade_listings: 0,
    cash_terms: 0,
    fulfilment_trade_offers: 0,
  }),
  [],
  'safe card-only offer/event totals must remain informational on rerun',
);
assert.deepEqual(
  findUnsafeFinancialStateCounts({ trade_offer_rows: 1, cash_terms: 1 }),
  ['cash_terms'],
);
assert.deepEqual(
  findUnsafeFinancialStateCounts({
    trade_offer_rows: 1,
    trade_offer_card_rows: 2,
    invalid_disputed_events: 1,
  }),
  ['invalid_disputed_events'],
  'invalid disputed events must remain fatal while safe card totals are informational',
);

const safeDefaultAclContract = {
  owner_role: 'postgres',
  executor_can_alter: true,
  global_function_acl_rows: 1,
  unsafe_grant_count: 0,
};
assert.deepEqual(
  verifyGlobalFunctionDefaultContracts([safeDefaultAclContract]),
  [],
);
assert.deepEqual(
  verifyGlobalFunctionDefaultContracts([{
    ...safeDefaultAclContract,
    global_function_acl_rows: 0,
  }]),
  ['gate0_global_function_default_acl_missing:postgres'],
  'an absent owner default ACL must not inherit implicit PUBLIC EXECUTE',
);
assert.deepEqual(
  verifyGlobalFunctionDefaultContracts([{
    ...safeDefaultAclContract,
    unsafe_grant_count: 1,
  }]),
  ['gate0_global_function_default_acl_unsafe:postgres'],
);
assert.ok(
  verifyProtectedFunctionAclMatrix([])
    .includes('gate0_protected_function_inventory_drift'),
);
const expectedFunctionAclMatrix = expectedProtectedFunctionAclMatrix();
assert.equal(expectedFunctionAclMatrix.length, 37);
assert.deepEqual(verifyProtectedFunctionAclMatrix(expectedFunctionAclMatrix), []);
assert.ok(verifyProtectedFunctionAclMatrix(expectedFunctionAclMatrix.map((contract) => (
  contract.signature === 'public.admin_binder_directory()'
    ? { ...contract, service_execute: false }
    : contract
))).includes(
  'gate0_protected_function_acl_drift:public.admin_binder_directory()',
));
assert.ok(verifyProtectedFunctionAclMatrix(expectedFunctionAclMatrix.map((contract) => (
  contract.signature === 'public.is_admin()'
    ? { ...contract, owner_role: 'supabase_admin' }
    : contract
))).includes('gate0_protected_function_owner_drift:public.is_admin()'));

assert.equal(
  sha256(emergencyMigration),
  '79616c6b6c9b6edcae9dcf675c05766add935aa396f6d34e462008cf78359ac0',
  'the production emergency migration must retain the exact live content',
);
assert.deepEqual(
  emergencyMigration,
  liveEmergencyOverride,
  'the renamed staging emergency migration must be byte-identical',
);
assert.doesNotMatch(gate0Migration, /\brealtime\b/i, 'Gate 0 must not touch the locked realtime schema');
assert.doesNotMatch(
  gate0Migration,
  /^\s*(?:commit|rollback)\b/im,
  'the Gate 0 migration must remain wholly controlled by the rehearsal transaction',
);
assert.doesNotMatch(
  gate0Migration,
  /^\s*(?:(?:create|drop)\s+index\s+concurrently|reindex\b[^;\n]*\bconcurrently|vacuum\b|alter\s+system\b|(?:create|drop)\s+(?:database|tablespace)\b|call\b)/im,
  'the Gate 0 migration must not contain nontransactional DDL',
);
assert.doesNotThrow(
  () => assertRollbackSafeMigrationSql(gate0Migration),
  'the Gate 0 migration must remain wholly controlled by the rehearsal transaction',
);

for (const token of [
  'stackr_gate0_block_cash_terms',
  'stackr_gate0_block_legacy_trade_fulfilment',
  'stackr_gate0_guard_trade_offer_financial_state',
  'stackr_gate0_guard_trade_event_financial_state',
  'stackr_gate0_guard_listing_financial_state',
  'stackr_gate0_guard_profile_financial_binding',
  'stackr_gate0_block_family_purchases',
  'stackr_gate0_block_trade_reviews',
  'stackr_gate0_block_trader_ratings',
  'stackr_gate0_guard_trade_offer_card_membership',
  'stackr_gate0_guard_seller_entitlement',
  'stackr_gate0_user_has_premium_seller',
  'stackr_gate0_card_trade_dispute_allowed',
]) assert.match(gate0Migration, new RegExp(token));

const offerCardGuardBlock = gate0Migration.match(
  /create or replace function public\.stackr_gate0_guard_trade_offer_card_membership\(\)[\s\S]+?\$function\$;/,
)?.[0] ?? '';
assert.match(
  offerCardGuardBlock,
  /actor_id is null[\s\S]+actor_id is distinct from offer_sender_id/,
  'only the current offer sender may construct card membership',
);
assert.match(
  offerCardGuardBlock,
  /new\.owner_id = offer_receiver_id[\s\S]+new\.card_id is distinct from listing_card_id[\s\S]+new\.set_id is distinct from listing_set_id/,
  'the requested row must match the bound listing card and set exactly',
);
assert.match(
  offerCardGuardBlock,
  /user_card_variants[\s\S]+owned_variant\.card_id = new\.card_id[\s\S]+owned_variant\.set_id = new\.set_id[\s\S]+owned_variant\.quantity > 0[\s\S]+for update/,
  'sender ownership must use an exclusively locked positive canonical variant snapshot',
);
assert.match(
  offerCardGuardBlock,
  /for update[\s\S]+one requested listing card required/,
  'offer-row serialization must prevent duplicate requested-card inserts',
);
const boundOfferPolicyBlock = gate0Migration.match(
  /create policy "Stackr Gate 0 bound card offer inserts"[\s\S]+?\n\);/,
)?.[0] ?? '';
const participantCardPolicyBlock = gate0Migration.match(
  /create policy "Stackr Gate 0 participant cards only"[\s\S]+?\n\);/,
)?.[0] ?? '';
assert.match(participantCardPolicyBlock, /user_card_flags[\s\S]+user_card_variants/);
assert.match(
  participantCardPolicyBlock,
  /card_id = listing\.card_id[\s\S]+set_id is not distinct from listing\.set_id/,
);
assert.match(
  participantCardPolicyBlock,
  /owned_variant\.user_id = offer\.sender_id[\s\S]+owned_variant\.card_id = trade_offer_cards\.card_id[\s\S]+owned_variant\.set_id = trade_offer_cards\.set_id[\s\S]+owned_variant\.quantity > 0/,
);
assert.match(gate0Migration, /as restrictive\s+for all\s+to anon, authenticated\s+using \(false\)\s+with check \(false\)/i);
assert.match(gate0Migration, /Stackr Gate 0 entitled listing inserts/);
assert.match(gate0Migration, /Stackr Gate 0 entitled listing updates/);
assert.match(gate0Migration, /Stackr Gate 0 current listing visibility/);
assert.match(
  gate0Migration,
  /from auth\.users as entitled_user[\s\S]+raw_app_meta_data[\s\S]+stackr_premium_seller/,
  'Conditional surfaces must use the current server-owned Auth entitlement',
);
assert.match(gate0Migration, /security definer[\s\S]+set search_path = ''/i);
assert.doesNotMatch(
  gate0Migration.match(
    /create or replace function private\.stackr_gate0_user_has_premium_seller[\s\S]+?\$function\$;/,
  )?.[0] ?? '',
  /raw_user_meta_data|user_metadata|auth\.jwt/,
  'the trusted entitlement helper must never accept token or user-editable metadata',
);
assert.doesNotMatch(
  gate0Migration.match(/create policy "Stackr Gate 0 entitled listing inserts"[\s\S]+?\);/)?.[0] ?? '',
  /auth\.jwt|user_metadata/,
  'stale JWT or user-editable metadata must not authorize listing publication',
);
const sellerPolicyBlock = gate0Migration.match(
  /do \$seller_policies\$[\s\S]+?\$seller_policies\$;/,
)?.[0] ?? '';
for (const tableName of [
  'seller_inventory_items',
  'inventory_movements',
  'seller_sale_transactions',
  'seller_sale_transaction_items',
]) assert.match(sellerPolicyBlock, new RegExp(`'${tableName}'`));
for (const policyName of [
  'Stackr Gate 0 entitled seller inserts',
  'Stackr Gate 0 entitled seller updates',
  'Stackr Gate 0 entitled seller deletes',
]) assert.match(sellerPolicyBlock, new RegExp(policyName));
assert.match(sellerPolicyBlock, /as restrictive/i);
assert.match(sellerPolicyBlock, /stackr_gate0_user_has_premium_seller/);
assert.doesNotMatch(
  sellerPolicyBlock,
  /auth\.jwt|user_metadata/,
  'stale JWT or user-editable metadata must not authorize seller mutations',
);
assert.match(
  gate0Migration,
  /private\.seller_inventory_batch_commits[\s\S]+stackr_gate0_guard_seller_entitlement/,
  'the private seller batch receipt must have an RLS-bypass-safe entitlement trigger',
);
assert.match(
  gate0Migration,
  /status is not null[\s\S]+status in \('pending', 'accepted', 'declined', 'cancelled', 'disputed'\)[\s\S]+sender_sent is false/,
  'card-only disputes must remain available while fulfilment flags stay blocked',
);
assert.match(
  gate0Migration,
  /event_type in \([\s\S]+?'disputed'[\s\S]+?proposed_status[\s\S]+?'disputed'/,
  'card-only dispute events must pass both event allowlists',
);
assert.match(
  gate0Migration,
  /revoke all on table public\.seller_inventory_items\s+from public, anon, authenticated, service_role/,
  'inherited broad seller grants must be rebuilt explicitly',
);
const sellerGrantBlock = gate0Migration.match(
  /do \$seller_grants\$[\s\S]+?\$seller_grants\$;/,
)?.[0] ?? '';
assert.match(
  sellerGrantBlock,
  /grant select on table public\.seller_inventory_items\s+to authenticated, service_role/,
  'authenticated sellers must retain read access to their inventory',
);
assert.doesNotMatch(
  sellerGrantBlock,
  /grant (?:insert|update|delete|insert, update, delete)[^;]+\bto\s+authenticated\b/i,
  'authenticated seller mutations must pass only through the validated RPC',
);
assert.match(
  sellerGrantBlock,
  /revoke all on sequence public\.seller_sale_transaction_items_id_seq\s+from public, anon, authenticated, service_role/,
);
assert.match(
  sellerGrantBlock,
  /grant insert, update, delete on table private\.seller_inventory_batch_commits\s+to service_role/,
);
assert.doesNotMatch(
  sellerGrantBlock,
  /grant insert, update, delete on table private\.seller_inventory_batch_commits\s+to authenticated/,
);
assert.doesNotMatch(
  gate0Migration,
  /private\.premium_seller_runtime_control/,
  'staging hardening must not depend on the production-only seller runtime table',
);
assert.match(gate0Migration, /revoke insert \(payment_intent_id\), update \(payment_intent_id\)/i);
assert.match(gate0Migration, /revoke insert \(stripe_account_id\), update \(stripe_account_id\)/i);
assert.match(gate0Migration, /select current_user::text[\s\S]+object_schema\.nspname in \('public', 'private'\)/i);
assert.match(gate0Migration, /pg_has_role\(current_user, required_owner, 'MEMBER'\)/i);
assert.match(gate0Migration, /alter default privileges for role %I revoke execute on functions from public/i);
assert.match(gate0Migration, /global_function_default_acl_assertion_failed/i);
assert.match(gate0Migration, /defaclnamespace = 0[\s\S]+defaclobjtype = 'f'/i);
assert.match(gate0Migration, /revoke all on all functions in schema public[\s\S]+from public, anon, authenticated, service_role/i);
assert.match(gate0Migration, /revoke all on all functions in schema private[\s\S]+from public, anon, authenticated, service_role/i);
assert.match(gate0Migration, /stackr_gate0_protected_function_acl_matrix_assertion_failed/i);
assert.doesNotMatch(
  gate0Migration.match(/do \$default_privileges\$[\s\S]+?\$default_privileges\$;/)?.[0] ?? '',
  /supabase_admin/,
  'unused managed roles must not make the owner-derived default ACL contract impossible',
);
assert.match(
  gate0Migration,
  /if tg_op <> 'INSERT'[\s\S]+gate0_card_trade_membership_immutable/i,
  'offer-card membership rows must remain immutable during Gate 0',
);
const listingGuardBlock = gate0Migration.match(
  /create or replace function public\.stackr_gate0_guard_listing_financial_state\(\)[\s\S]+?\$function\$;/,
)?.[0] ?? '';
assert.match(
  listingGuardBlock,
  /trade_offers[\s\S]+referenced listing delete disabled[\s\S]+new\.card_id is distinct from old\.card_id[\s\S]+new\.set_id is distinct from old\.set_id[\s\S]+trade listing identity disabled/,
  'a referenced listing must retain its owner/card/set/type identity',
);
const disputeHelperBlock = gate0Migration.match(
  /create or replace function private\.stackr_gate0_card_trade_dispute_allowed[\s\S]+?\$function\$;/,
)?.[0] ?? '';
assert.match(
  disputeHelperBlock,
  /sender_card\.offer_id = offer\.id[\s\S]+sender_card\.owner_id = offer\.sender_id[\s\S]+select count\(\*\)[\s\S]+requested_card\.offer_id = offer\.id[\s\S]+requested_card\.owner_id = offer\.receiver_id[\s\S]+requested_card\.card_id = listing\.card_id[\s\S]+requested_card\.set_id is not distinct from listing\.set_id[\s\S]+invalid_card\.offer_id = offer\.id[\s\S]+trade_cash_terms/,
  'disputes require complete bound card membership and no cash',
);

const validCardTradeAssociations = Object.freeze({
  boundOfferPolicyCheck: boundOfferPolicyBlock,
  participantCardPolicyCheck: participantCardPolicyBlock,
  disputeHelperDefinition: disputeHelperBlock,
  membershipGuardDefinition: offerCardGuardBlock,
});
assert.deepEqual(
  verifyCatalogCardTradeAssociations(validCardTradeAssociations),
  [],
  'the deployed policy/function text must preserve every card-trade association',
);

const cardTradeAssociationErrors = Object.freeze([
  'gate0_bound_offer_policy_association_drift',
  'gate0_participant_card_policy_association_drift',
  'gate0_dispute_helper_association_drift',
  'gate0_membership_guard_association_drift',
]);
function verifyCardTradeAssociationCatalog(overrides = {}) {
  const definitions = { ...validCardTradeAssociations, ...overrides };
  return verifyCatalog({
    markerInventory: {},
    globalFunctionDefaultContracts: [],
    protectedFunctionAcls: [],
    rls: [],
    constraints: [],
    triggers: [],
    policies: [
      {
        table_name: 'trade_offers',
        policy_name: 'Stackr Gate 0 bound card offer inserts',
        permissive: 'RESTRICTIVE',
        cmd: 'INSERT',
        roles: ['authenticated'],
        with_check: definitions.boundOfferPolicyCheck,
      },
      {
        table_name: 'trade_offer_cards',
        policy_name: 'Stackr Gate 0 participant cards only',
        permissive: 'RESTRICTIVE',
        cmd: 'INSERT',
        roles: ['authenticated'],
        with_check: definitions.participantCardPolicyCheck,
      },
    ],
    tablePrivileges: [],
    columnPrivileges: [],
    authenticatedProfileColumnPrivileges: safeAuthenticatedProfileAcl,
    safeTradeOfferColumnPrivileges: [],
    sequencePrivileges: [],
    sellerReceiptPrivileges: [],
    functions: [
      {
        signature: 'private.stackr_gate0_card_trade_dispute_allowed(uuid,uuid)',
        function_kind: 'dispute_helper',
        definition: definitions.disputeHelperDefinition,
        present: true,
        public_cannot_execute: true,
        anon_cannot_execute: true,
        authenticated_cannot_execute: false,
        service_role_cannot_execute: true,
        security_definer: true,
        empty_search_path: true,
        owner_role: 'postgres',
      },
      {
        signature: 'public.stackr_gate0_guard_trade_offer_card_membership()',
        function_kind: 'guard',
        definition: definitions.membershipGuardDefinition,
        present: true,
        public_cannot_execute: true,
        anon_cannot_execute: true,
        authenticated_cannot_execute: true,
        service_role_cannot_execute: true,
        security_invoker: true,
        empty_search_path: true,
        owner_role: 'postgres',
      },
    ],
    unsafeDefaultPrivilegeCount: 0,
  });
}

const validAssociationCatalogErrors = verifyCardTradeAssociationCatalog();
for (const errorCode of cardTradeAssociationErrors) {
  assert.equal(
    validAssociationCatalogErrors.includes(errorCode),
    false,
    `valid catalog text must not report ${errorCode}`,
  );
}

const deparsedBoundOfferPolicyCheck = `
  ((sender_id = ( SELECT auth.uid() AS uid))
    AND (sender_id <> receiver_id)
    AND (listing_id IS NOT NULL)
    AND (EXISTS (
      SELECT 1
      FROM public.user_card_flags bound_listing
      WHERE ((bound_listing.id = trade_offers.listing_id)
        AND (bound_listing.user_id = trade_offers.receiver_id)
        AND (bound_listing.flag_type = 'trade'::text)
        AND (COALESCE(bound_listing.listing_status, 'active'::text) = 'active'::text)
        AND private.stackr_gate0_user_has_premium_seller(bound_listing.user_id))
    )))
`;
assert.equal(
  verifyCardTradeAssociationCatalog({
    boundOfferPolicyCheck: deparsedBoundOfferPolicyCheck,
  }).includes('gate0_bound_offer_policy_association_drift'),
  false,
  'verifyCatalog must accept the exact associations in pg_get_expr deparsed policy text',
);

const deparsedParticipantPolicyCheck = participantCardPolicyBlock
  .replace('(select auth.uid())', '( SELECT auth.uid() AS uid)')
  .replace("listing.flag_type = 'trade'", "listing.flag_type = 'trade'::text")
  .replace(
    'trade_offer_cards.set_id is not distinct from listing.set_id',
    'NOT (trade_offer_cards.set_id IS DISTINCT FROM listing.set_id)',
  );
assert.notEqual(
  deparsedParticipantPolicyCheck,
  participantCardPolicyBlock,
  'the deparsed participant-policy fixture must exercise catalog syntax',
);
assert.equal(
  verifyCardTradeAssociationCatalog({
    participantCardPolicyCheck: deparsedParticipantPolicyCheck,
  }).includes('gate0_participant_card_policy_association_drift'),
  false,
  'verifyCatalog must accept the deparsed null-safe requested-card binding',
);

const unboundOfferPolicy = boundOfferPolicyBlock.replace(
  'where bound_listing.id = trade_offers.listing_id',
  `where bound_listing.id = bound_listing.id
      and trade_offers.listing_id is not null`,
);
assert.ok(
  verifyCardTradeAssociationCatalog({
    boundOfferPolicyCheck: unboundOfferPolicy,
  }).includes('gate0_bound_offer_policy_association_drift'),
  'verifyCatalog must reject an offer policy that mentions but does not bind the listing',
);

const crossJoinedParticipantPolicy = participantCardPolicyBlock.replace(
  `join public.user_card_flags as listing
      on listing.id = offer.listing_id
      and listing.user_id = offer.receiver_id
      and listing.flag_type = 'trade'`,
  'cross join public.user_card_flags as listing',
);
assert.ok(
  verifyCardTradeAssociationCatalog({
    participantCardPolicyCheck: crossJoinedParticipantPolicy,
  }).includes('gate0_participant_card_policy_association_drift'),
  'verifyCatalog must reject participant-card policy cross joins that retain weak tokens',
);

const nonExactDisputeHelper = disputeHelperBlock.replace(
  'and 1 = (',
  'and exists (',
);
assert.ok(
  verifyCardTradeAssociationCatalog({
    disputeHelperDefinition: nonExactDisputeHelper,
  }).includes('gate0_dispute_helper_association_drift'),
  'verifyCatalog must require exactly one requested listing card for disputes',
);

const unboundMembershipOfferLock = offerCardGuardBlock.replace(
  `where offer.id = new.offer_id
  for update;`,
  `where offer.id = offer.id
  for update;`,
);
assert.ok(
  verifyCardTradeAssociationCatalog({
    membershipGuardDefinition: unboundMembershipOfferLock,
  }).includes('gate0_membership_guard_association_drift'),
  'verifyCatalog must bind the locked offer lookup to the inserted card row',
);

const wrongRequestedOwnerGuard = offerCardGuardBlock.replace(
  'existing_requested_card.owner_id = offer_receiver_id',
  'existing_requested_card.owner_id = offer_sender_id',
);
assert.ok(
  verifyCardTradeAssociationCatalog({
    membershipGuardDefinition: wrongRequestedOwnerGuard,
  }).includes('gate0_membership_guard_association_drift'),
  'verifyCatalog must bind the existing requested row to the receiver',
);
assert.match(gate0Migration, /Stackr Gate 0 entitled seller batch reads/);
assert.match(gate0Migration, /trigger_record\.tgtype = 31/);
assert.match(gate0Migration, /Stackr Gate 0 bound card offer inserts/);
assert.match(
  gate0Migration,
  /for share[\s\S]+bound_listing_owner_id[\s\S]+stackr_gate0_user_has_premium_seller/i,
  'offer creation must serialize with listing archival and require current entitlement',
);
assert.match(gate0Migration, /stackr_gate0_exact_mutation_trigger_assertion_failed/);
assert.match(gate0Migration, /stackr_gate0_hidden_lifecycle_catalog_assertion_failed/);
assert.match(gate0Migration, /stackr_gate0_forbidden_state_assertion_failed/);
assert.match(
  gate0Migration,
  /invalid_offer_bindings[\s\S]+invalid_disputed_offers[\s\S]+invalid_offer_card_owners[\s\S]+invalid_sender_offer_cards_at_apply[\s\S]+unsafe_trade_events[\s\S]+invalid_disputed_events/,
  'the atomic migration assertion must reject unsafe card-trade integrity drift',
);
assert.match(
  gate0Migration,
  /invalid_sender_offer_cards_at_apply[\s\S]+user_card_variants[\s\S]+quantity > 0/,
  'pre-existing sender cards need a one-time canonical ownership baseline',
);

const ledger = loadStagingMigrationLedger(undefined, {
  requireResolvableProvenance: true,
});
assert.equal(ledger.appliedEntries.length, 146);
assert.equal(ledger.pendingEntries.length, 1);
assert.equal(ledger.entries.length, 147);
assert.equal(ledger.pendingEntries[0].version, '20260827124944');
assert.equal(ledger.pendingEntries[0].sourceSha256, sha256(readFileSync(gate0MigrationPath)));
assert.equal(
  ledger.manifest.expectedGate0RemoteStatementsSha256,
  singleStatementRemoteSha256(gate0Migration),
  'the pinned CLI one-statement array hash must bind the complete Gate 0 SQL',
);
const exactGate0RemoteRow = {
  version: ledger.pendingEntries[0].version,
  name: ledger.pendingEntries[0].name,
  statement_count: 1,
  firstStatementSha256: ledger.pendingEntries[0].sourceSha256,
  remoteStatementsSha256: ledger.manifest.expectedGate0RemoteStatementsSha256,
};
assert.deepEqual(
  verifyGate0RemoteStatementContract(
    exactGate0RemoteRow,
    ledger.pendingEntries[0],
    ledger.manifest,
  ),
  [],
);
const wrongBodyGate0Migration = `${gate0Migration}\n-- same version, wrong body fixture\n`;
const hostileGate0RemoteErrors = verifyGate0RemoteStatementContract(
  {
    ...exactGate0RemoteRow,
    firstStatementSha256: sha256(wrongBodyGate0Migration),
    remoteStatementsSha256: singleStatementRemoteSha256(
      wrongBodyGate0Migration,
    ),
  },
  ledger.pendingEntries[0],
  ledger.manifest,
);
assert.ok(hostileGate0RemoteErrors.includes(
  'staging_gate0_remote_raw_statement_hash_drift',
));
assert.ok(hostileGate0RemoteErrors.includes(
  'staging_gate0_remote_statement_array_hash_drift',
), 'a same-version different-body final migration must fail closed');
assert.equal(
  ledger.manifest.expectedAppliedRemoteStatementLedgerSha256,
  'ff74f9f45a28d667e0480f30a0dfc492649490c61122715eca8f9f9ccab5d87a',
);
assert.ok(!ledger.entries.some((entry) => entry.source === EXCLUDED_SYNTHETIC_FIXTURE));

const localVerification = spawnSync(
  process.execPath,
  [
    'scripts/deploy/verify-staging-migration-ledger.mjs',
    '--phase=local',
    '--require-resolvable-provenance',
  ],
  { cwd: process.cwd(), encoding: 'utf8' },
);
assert.equal(
  localVerification.status,
  0,
  localVerification.stderr || localVerification.stdout,
);
const localVerificationResult = JSON.parse(localVerification.stdout);
assert.equal(localVerificationResult.localEntryCount, 147);
assert.equal(localVerificationResult.expectedAppliedCount, 146);
assert.equal(localVerificationResult.pendingCount, 1);

const tempParent = mkdtempSync(path.join(tmpdir(), 'stackr-gate0-ledger-test-'));
try {
  const outputRoot = path.join(tempParent, 'materialized');
  const materialized = spawnSync(
    process.execPath,
    [
      'scripts/deploy/materialize-staging-migration-ledger.mjs',
      `--output=${outputRoot}`,
    ],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  assert.equal(materialized.status, 0, materialized.stderr || materialized.stdout);
  const files = readdirSync(path.join(outputRoot, 'supabase/migrations')).sort();
  assert.equal(files.length, 147);
  assert.equal(files.at(-1), '20260827124944_gate0_financial_route_containment.sql');
  assert.ok(!files.includes(path.basename(EXCLUDED_SYNTHETIC_FIXTURE)));
  const attestation = JSON.parse(read(`${outputRoot}/.stackr-ledger-attestation.json`));
  assert.equal(attestation.appliedCount, 146);
  assert.equal(attestation.pendingCount, 1);
  assert.equal(attestation.entryCount, 147);
  assert.equal(
    attestation.gate0RemoteStatementsSha256,
    ledger.manifest.expectedGate0RemoteStatementsSha256,
  );
} finally {
  rmSync(tempParent, { recursive: true, force: true });
}

const liveVerifier = read('scripts/deploy/verify-gate0-financial-route-containment.mjs');
const catalogCardProbeBlock = liveVerifier.match(
  /const catalogCard = await client\.query\(`[\s\S]+?limit 3[\s\S]+?`/,
)?.[0] ?? '';
assert.match(catalogCardProbeBlock, /owned_variant\.card_id = card\.id/);
assert.doesNotMatch(
  catalogCardProbeBlock,
  /owned_variant\.set_id/,
  'orthogonal hostile probes require candidate cards unowned in every set',
);
assert.match(liveVerifier, /begin read only/);
assert.match(
  liveVerifier,
  /roles::text\[\] AS roles/,
  'pg policy name[] roles must be cast to a driver-parsed text[]',
);
assert.match(liveVerifier, /Array\.isArray\(policy\?\.roles\)/);
assert.match(liveVerifier, /authenticatedProfileColumnPrivileges/);
assert.match(liveVerifier, /\('id', 'UPDATE'\)/);
assert.match(liveVerifier, /\('email', 'INSERT'\)/);
assert.match(liveVerifier, /\('email', 'UPDATE'\)/);
assert.match(liveVerifier, /\('role', 'INSERT'\)/);
assert.match(liveVerifier, /\('role', 'UPDATE'\)/);
assert.match(liveVerifier, /client_profile_id_update/);
assert.match(liveVerifier, /client_profile_email_update/);
assert.match(liveVerifier, /client_profile_role_update/);
assert.match(liveVerifier, /rollbackOnlyWriteProbe/);
assert.match(liveVerifier, /client_unentitled_active_listing/);
assert.match(liveVerifier, /client_unentitled_seller_inventory/);
assert.match(liveVerifier, /client_unentitled_seller_sale/);
assert.match(liveVerifier, /client_unentitled_seller_batch_rpc/);
assert.match(liveVerifier, /client_entitled_direct_seller_write/);
assert.match(liveVerifier, /client_entitled_direct_seller_receipt/);
assert.match(liveVerifier, /gate0_probe_entitled_seller_batch_result_invalid/);
assert.match(liveVerifier, /client_empty_offer_disputed_status/);
assert.match(liveVerifier, /client_partial_offer_disputed_status/);
assert.match(liveVerifier, /client_partial_offer_disputed_event/);
assert.match(liveVerifier, /Gate 0 card-trade safety verification/);
assert.match(liveVerifier, /client_stale_jwt_active_listing_mutation/);
assert.match(liveVerifier, /client_stale_jwt_seller_batch_noop_rpc/);
assert.match(liveVerifier, /client_stale_jwt_seller_batch_replay_rpc/);
assert.match(liveVerifier, /gate0_probe_revoked_seller_batch_receipt_visible/);
assert.match(liveVerifier, /service_unentitled_seller_trigger/);
assert.match(liveVerifier, /owner_unentitled_seller_trigger/);
assert.match(liveVerifier, /service_revoked_seller_inventory_update/);
assert.match(liveVerifier, /service_revoked_seller_inventory_delete/);
assert.match(liveVerifier, /owner_revoked_seller_inventory_update/);
assert.match(liveVerifier, /owner_revoked_seller_inventory_delete/);
assert.match(liveVerifier, /service_revoked_seller_receipt_update/);
assert.match(liveVerifier, /service_revoked_seller_receipt_delete/);
assert.match(liveVerifier, /owner_revoked_seller_receipt_update/);
assert.match(liveVerifier, /owner_revoked_seller_receipt_delete/);
assert.match(liveVerifier, /client_null_listing_offer/);
assert.match(liveVerifier, /client_missing_listing_offer/);
assert.match(liveVerifier, /client_inactive_listing_offer/);
assert.match(liveVerifier, /client_self_trade_offer/);
assert.match(liveVerifier, /client_arbitrary_receiver_offer/);
assert.match(liveVerifier, /client_revoked_listing_owner_offer/);
assert.match(liveVerifier, /client_requested_card_listing_mismatch/);
assert.match(liveVerifier, /client_requested_card_set_mismatch/);
assert.match(liveVerifier, /client_unowned_sender_card/);
assert.match(liveVerifier, /client_owned_sender_card_set_mismatch/);
assert.match(liveVerifier, /client_duplicate_requested_listing_card/);
assert.match(liveVerifier, /owner_unbound_trade_offer_trigger/);
assert.match(liveVerifier, /service_trade_offer_binding_rewrite_trigger/);
assert.match(liveVerifier, /owner_trade_offer_binding_rewrite_trigger/);
assert.match(liveVerifier, /service_trade_offer_card_rewrite_trigger/);
assert.match(liveVerifier, /service_trade_offer_card_delete_trigger/);
assert.match(liveVerifier, /service_requested_card_listing_mismatch_trigger/);
assert.match(liveVerifier, /service_requested_card_set_mismatch_trigger/);
assert.match(liveVerifier, /service_duplicate_requested_card_trigger/);
assert.match(liveVerifier, /service_third_party_card_owner_trigger/);
assert.match(liveVerifier, /service_unowned_sender_card_trigger/);
assert.match(liveVerifier, /service_owned_sender_card_set_mismatch_trigger/);
assert.match(liveVerifier, /service_referenced_listing_identity_rewrite_trigger/);
assert.match(liveVerifier, /service_referenced_listing_delete_trigger/);
assert.match(liveVerifier, /owner_requested_card_listing_mismatch_trigger/);
assert.match(liveVerifier, /owner_requested_card_set_mismatch_trigger/);
assert.match(liveVerifier, /owner_duplicate_requested_card_trigger/);
assert.match(liveVerifier, /owner_third_party_card_owner_trigger/);
assert.match(liveVerifier, /owner_unowned_sender_card_trigger/);
assert.match(liveVerifier, /owner_owned_sender_card_set_mismatch_trigger/);
assert.match(liveVerifier, /owner_referenced_listing_identity_rewrite_trigger/);
assert.match(liveVerifier, /owner_referenced_listing_delete_trigger/);
assert.match(liveVerifier, /owner_trade_review_trigger/);
assert.match(liveVerifier, /owner_trader_rating_trigger/);
assert.match(liveVerifier, /owner_disputed_sole_card_offer_rewrite/);
assert.match(liveVerifier, /owner_disputed_sole_card_delete/);
assert.match(liveVerifier, /trigger_record\.tgtype & 16/);
assert.match(liveVerifier, /trigger_record\.tgtype & 8/);
assert.match(liveVerifier, /pg_catalog\.currval\('public\.seller_sale_transaction_items_id_seq'\)/);
assert.match(liveVerifier, /errorCode === '55000'/);
assert.match(liveVerifier, /least\(coalesce\(min\(sale_item\.id\), 0\), 0\) - 1/);
assert.match(liveVerifier, /verifyProtectedFunctionAclMatrix/);
assert.match(liveVerifier, /verifyGlobalFunctionDefaultContracts/);
assert.match(liveVerifier, /raw_app_meta_data[\s\S]+stackr_premium_seller/);
assert.match(liveVerifier, /gate0_staging_financial_state_not_zero/);
assert.match(liveVerifier, /gate0_probe_cleanup_failed/);
assert.match(liveVerifier, /gate0_probe_cleanup_state_drift/);
assert.match(liveVerifier, /gate0_probe_restoration_query_failed/);
assert.match(liveVerifier, /gate0_probe_post_cleanup_reread_failed/);
assert.match(liveVerifier, /gate0_probe_financial_state_not_restored/);
assert.match(liveVerifier, /gate0_probe_catalog_not_restored/);
assert.match(liveVerifier, /sender_owned_variants_removed/);
assert.match(
  liveVerifier,
  /owned_variant\.id = \$16::uuid[\s\S]+as sender_owned_variants_removed/,
);
assert.match(
  liveVerifier,
  /\[offerId, emptyOfferId, cardIdentityProbeOfferId\]\.filter\(Boolean\)/,
);
assert.match(
  liveVerifier,
  /saleItemSequenceBefore\?\.is_called \?\? null,[\s\S]+senderOwnedVariantId/,
);
assert.match(
  liveVerifier,
  /service_requested_card_listing_mismatch_trigger[\s\S]{0,400}\[cardIdentityProbeOfferId, receiverId, wishlistCardId, listingSetId\]/,
);
assert.match(
  liveVerifier,
  /owner_requested_card_set_mismatch_trigger[\s\S]{0,400}\[cardIdentityProbeOfferId, receiverId, listingCardId, wrongSetId\]/,
);
assert.match(liveVerifier, /trade_offer_card_rows/);
assert.match(liveVerifier, /invalid_disputed_events/);
assert.match(liveVerifier, /invalid_sender_offer_cards_at_apply/);
assert.match(liveVerifier, /readPreApplySenderOfferCardOwnershipCount/);
assert.doesNotMatch(
  liveVerifier,
  /\.catch\(\(\) => \{\}\)/,
  'Gate 0 verifier cleanup failures must never be swallowed',
);
assert.doesNotMatch(liveVerifier, /console\.log\([^\n]*(?:senderId|receiverId|offerId|listingId)/);

const rehearsal = read('scripts/deploy/rehearse-gate0-financial-route-containment.mjs');
assert.match(rehearsal, /begin isolation level repeatable read/);
assert.match(rehearsal, /findUnsafeTopLevelMigrationStatements\(migrationSql\)/);
assert.match(rehearsal, /await client\.query\(migrationSql\)/);
assert.match(rehearsal, /runRollbackOnlyWriteProbe\(client,[\s\S]+outerTransaction: true/);
assert.match(rehearsal, /verifyCatalog\(fullCatalog\)/);
assert.match(rehearsal, /readTransactionIdentity\(client\)/);
assert.match(rehearsal, /gate0_rehearsal_catalog_backend_changed/);
assert.match(rehearsal, /gate0_rehearsal_catalog_transaction_changed/);
assert.match(rehearsal, /behaviorProbeRan/);
assert.match(
  rehearsal,
  /behaviorProbeErrorCount: behaviorProbeRan \? probeErrors\.length : null/,
  'a skipped behavior probe must never be reported as zero errors',
);
assert.match(rehearsal, /gate0_rehearsal_rollback_catalog_drift/);
assert.match(rehearsal, /await client\.query\('rollback'\)/);
assert.match(rehearsal, /gate0_rehearsal_rollback_state_drift/);
assert.match(rehearsal, /gate0_rehearsal_rollback_history_drift/);
assert.match(rehearsal, /gate0_rehearsal_rollback_failed/);
assert.match(rehearsal, /gate0_rehearsal_restoration_verification_failed/);
assert.match(rehearsal, /rollbackVerified/);
assert.match(rehearsal, /orderedRemoteStatementLedgerSha256/);
assert.match(rehearsal, /gate0_rehearsal_safe_trade_offer_row_preservation/);
assert.match(rehearsal, /gate0_rehearsal_safe_trade_offer_event_row_preservation/);
assert.match(rehearsal, /gate0_rehearsal_trade_offer_card_row_preservation/);
assert.match(rehearsal, /invalid_disputed_events/);
assert.match(rehearsal, /invalid_sender_offer_cards_at_apply/);
assert.match(rehearsal, /constraint_markers, 14/);
assert.match(rehearsal, /trigger_markers, 17/);
assert.match(rehearsal, /policy_markers, 26/);
assert.doesNotMatch(
  rehearsal,
  /\.catch\(\(\) => \{\}\)/,
  'Gate 0 rehearsal cleanup and restoration failures must never be swallowed',
);
assert.doesNotMatch(rehearsal, /console\.log\([^\n]*(?:user_id|senderId|receiverId)/);

const ledgerVerifier = read('scripts/deploy/verify-staging-migration-ledger.mjs');
assert.match(ledgerVerifier, /verifyGate0RemoteStatementContract/);
assert.match(ledgerVerifier, /extensions\.digest\(statements\[1\], 'sha256'\)/);
assert.match(ledgerVerifier, /staging_remote_ledger_connection_cleanup_failed/);
assert.doesNotMatch(
  ledgerVerifier,
  /\.catch\(\(\) => \{\}\)/,
  'staging ledger cleanup failures must never be swallowed',
);

console.log('Gate 0 database hardening and staging ledger contract passed.');
