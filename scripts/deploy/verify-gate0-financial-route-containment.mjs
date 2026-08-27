import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createVerifiedSupabasePostgresClient } from './verified-supabase-postgres.mjs';

const EXPECTED_PROJECT_REF = 'lmwfhvexfcoyeuoyrlco';
const GATE0_MIGRATION_VERSION = '20260827124944';
const DEFAULT_DB_URL_ENVIRONMENT = 'STACKR_SOURCE_DB_URL';
const PHASES = new Set(['pre-apply', 'post-apply', 'report']);
const PROBE_RESTORATION_CONTRACTS = Object.freeze([
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
]);
const INFORMATIONAL_FINANCIAL_STATE_COUNTS = new Set([
  'trade_offer_rows',
  'trade_offer_event_rows',
  'trade_offer_card_rows',
  'trade_listing_rows',
  'active_trade_listings',
  'archived_trade_listings',
]);
const PROTECTED_FUNCTION_EXECUTE_ALLOWLIST = new Map([
  ['public.admin_binder_directory()', { anon: false, authenticated: true, service: true }],
  ['public.archive_family_child_profile(uuid)', { anon: false, authenticated: true, service: false }],
  ['public.create_family_child_profile(text,text,boolean)', { anon: false, authenticated: true, service: false }],
  ['public.get_active_scanner_threshold_set()', { anon: false, authenticated: true, service: true }],
  ['public.is_admin()', { anon: true, authenticated: true, service: true }],
  ['public.is_recognition_feedback_reviewer()', { anon: false, authenticated: true, service: true }],
  ['public.is_scan_lab_admin()', { anon: false, authenticated: true, service: true }],
  ['public.purchase_cosmetic(text)', { anon: false, authenticated: true, service: true }],
  ['public.recalculate_binder_values(uuid)', { anon: false, authenticated: true, service: true }],
  ['public.update_binder_card_prices()', { anon: false, authenticated: false, service: true }],
  ['public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)', { anon: false, authenticated: true, service: false }],
  ['private.stackr_gate0_user_has_premium_seller(uuid)', { anon: true, authenticated: true, service: true }],
  ['private.stackr_gate0_card_trade_dispute_allowed(uuid,uuid)', { anon: false, authenticated: true, service: false }],
]);
const PROTECTED_FUNCTION_SIGNATURES = Object.freeze([
  'public.accept_trade_offer(uuid)',
  'public.admin_binder_directory()',
  'public.archive_family_child_profile(uuid)',
  'public.award_achievement_unlock_coins()',
  'public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)',
  'public.create_family_child_profile(text,text,boolean)',
  'public.create_family_purchase_request(uuid,uuid)',
  'public.enforce_wanted_card_limit()',
  'public.get_active_scanner_threshold_set()',
  'public.handle_new_user()',
  'public.is_admin()',
  'public.is_recognition_feedback_reviewer()',
  'public.is_scan_lab_admin()',
  'public.prevent_user_feedback_review_field_changes()',
  'public.purchase_cosmetic(text)',
  'public.queue_scanner_feedback_review()',
  'public.recalculate_binder_values(uuid)',
  'public.respond_family_purchase_request(uuid,text)',
  'public.set_updated_at()',
  'public.stackr_gate0_block_financial_write()',
  'public.stackr_gate0_block_legacy_fulfilment_write()',
  'public.stackr_gate0_guard_listing_financial_state()',
  'public.stackr_gate0_guard_profile_financial_binding()',
  'public.stackr_gate0_guard_seller_entitlement()',
  'public.stackr_gate0_guard_trade_event_financial_state()',
  'public.stackr_gate0_guard_trade_offer_card_membership()',
  'public.stackr_gate0_guard_trade_offer_financial_state()',
  'public.sync_profile_public_directory()',
  'public.touch_recognition_feedback_updated_at()',
  'public.touch_recognition_shadow_mode_updated_at()',
  'public.touch_scan_lab_capture_updated_at()',
  'public.touch_updated_at()',
  'public.trigger_recalculate_binder_values()',
  'public.update_binder_card_prices()',
  'private.commit_seller_inventory_batch_delegate(text,jsonb,jsonb,jsonb,jsonb,jsonb)',
  'private.stackr_gate0_card_trade_dispute_allowed(uuid,uuid)',
  'private.stackr_gate0_user_has_premium_seller(uuid)',
]);
const EXPECTED_PROTECTED_FUNCTION_COUNT = PROTECTED_FUNCTION_SIGNATURES.length;

const phase = process.argv
  .find((argument) => argument.startsWith('--phase='))
  ?.slice('--phase='.length) ?? 'report';
const dbUrlEnvironment = process.argv
  .find((argument) => argument.startsWith('--db-url-env='))
  ?.slice('--db-url-env='.length) ?? DEFAULT_DB_URL_ENVIRONMENT;

if (!PHASES.has(phase)) throw new Error(`invalid_gate0_verification_phase:${phase}`);

const result = {
  ok: false,
  phase,
  projectRef: EXPECTED_PROJECT_REF,
  migrationVersion: GATE0_MIGRATION_VERSION,
  databaseReadOnlyInspection: true,
  rollbackOnlyWriteProbe: phase === 'post-apply',
  remoteState: 'unknown',
  financialStateCounts: {},
  catalog: {},
  observations: [],
  errors: [],
};

function safeErrorCode(error) {
  const code = String(error?.code ?? 'unknown');
  return /^[A-Z0-9_]{1,32}$/.test(code) ? code : 'unknown';
}

function key(tableName, itemName) {
  return `${tableName}.${itemName}`;
}

function mapBy(rows, rowKey) {
  return new Map(rows.map((row) => [rowKey(row), row]));
}

export function hasExactPolicyRoles(policy, expectedRoles) {
  if (!Array.isArray(policy?.roles) || !Array.isArray(expectedRoles)) return false;
  if (policy.roles.length !== expectedRoles.length) return false;
  const actual = [...policy.roles].sort();
  const expected = [...expectedRoles].sort();
  return actual.every((role, index) => role === expected[index]);
}

const EXPECTED_AUTHENTICATED_PROFILE_ACL = new Set([
  'id:UPDATE',
  'email:INSERT',
  'email:UPDATE',
  'role:INSERT',
  'role:UPDATE',
  'stripe_account_id:INSERT',
  'stripe_account_id:UPDATE',
]);

export function verifyAuthenticatedProfileAclMatrix(rows) {
  const errors = [];
  const acl = mapBy(rows ?? [], (row) => `${row.column_name}:${row.privilege_name}`);
  if (acl.size !== EXPECTED_AUTHENTICATED_PROFILE_ACL.size) {
    errors.push('gate0_authenticated_profile_acl_matrix_incomplete');
  }
  for (const contract of EXPECTED_AUTHENTICATED_PROFILE_ACL) {
    if (acl.get(contract)?.allowed !== false) {
      errors.push(`gate0_authenticated_profile_column_privilege:${contract}`);
    }
  }
  return errors;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => canonicalJson(entry))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, entry]) => [name, canonicalJson(entry)]),
    );
  }
  return value;
}

function catalogAndStateMatch(before, after) {
  return JSON.stringify(canonicalJson(before)) === JSON.stringify(canonicalJson(after));
}

export function verifyProbeRestorationResult(restoration) {
  const errors = [];
  if (restoration?.rowCount !== 1 || restoration?.rows?.length !== 1) {
    errors.push('gate0_probe_restoration_row_count_invalid');
    return errors;
  }

  const proof = restoration.rows[0];
  const actualContracts = Object.keys(proof).sort();
  const expectedContracts = [...PROBE_RESTORATION_CONTRACTS].sort();
  if (JSON.stringify(actualContracts) !== JSON.stringify(expectedContracts)) {
    errors.push('gate0_probe_restoration_contract_keys_invalid');
    return errors;
  }
  for (const contract of PROBE_RESTORATION_CONTRACTS) {
    if (proof[contract] !== true) {
      errors.push(`gate0_probe_cleanup_state_drift:${contract}`);
    }
  }
  return errors;
}

export function findUnsafeFinancialStateCounts(
  counts,
  { allowUnentitledActiveListings = false } = {},
) {
  return Object.entries(counts)
    .filter(([name, count]) => count !== 0
      && !INFORMATIONAL_FINANCIAL_STATE_COUNTS.has(name)
      && !(allowUnentitledActiveListings
        && name === 'unentitled_active_trade_listings'))
    .map(([name]) => name);
}

export function requiresPreApplySenderOwnershipBaseline(
  verificationPhase,
  migrationApplied,
) {
  return verificationPhase === 'pre-apply' && migrationApplied === false;
}

function matchesEveryAssociation(definition, patterns) {
  const normalized = String(definition ?? '').toLowerCase();
  return patterns.every((pattern) => pattern.test(normalized));
}

const BOUND_OFFER_POLICY_ASSOCIATIONS = Object.freeze([
  /(?:trade_offers\.)?sender_id\s*=\s*\(*\s*(?:select\s+)?auth\.uid\(\)(?:\s+as\s+[a-z_][a-z0-9_]*)?\s*\)*/,
  /(?:trade_offers\.)?sender_id\s*<>\s*(?:trade_offers\.)?receiver_id/,
  /(?:trade_offers\.)?listing_id\s+is\s+not\s+null/,
  /bound_listing\.id\s*=\s*trade_offers\.listing_id/,
  /bound_listing\.user_id\s*=\s*trade_offers\.receiver_id/,
  /bound_listing\.flag_type\s*=\s*'trade'/,
  /coalesce\(bound_listing\.listing_status,\s*'active'(?:\s*::\s*(?:pg_catalog\.)?text)?\s*\)\s*=\s*'active'(?:\s*::\s*(?:pg_catalog\.)?text)?/,
  /stackr_gate0_user_has_premium_seller\([\s\n]*bound_listing\.user_id/,
]);

const PARTICIPANT_CARD_POLICY_ASSOCIATIONS = Object.freeze([
  /listing\.id\s*=\s*offer\.listing_id/,
  /listing\.user_id\s*=\s*offer\.receiver_id/,
  /listing\.flag_type\s*=\s*'trade'/,
  /offer\.id\s*=\s*trade_offer_cards\.offer_id/,
  /offer\.sender_id\s*=\s*[\s\S]{0,80}auth\.uid\(\)/,
  /trade_offer_cards\.owner_id\s*=\s*offer\.receiver_id[\s\S]+trade_offer_cards\.card_id\s*=\s*listing\.card_id[\s\S]+(?:trade_offer_cards\.set_id\s+is\s+not\s+distinct\s+from\s+listing\.set_id|not\s*\(\s*trade_offer_cards\.set_id\s+is\s+distinct\s+from\s+listing\.set_id\s*\))/,
  /trade_offer_cards\.owner_id\s*=\s*offer\.sender_id[\s\S]+owned_variant\.user_id\s*=\s*offer\.sender_id[\s\S]+owned_variant\.card_id\s*=\s*trade_offer_cards\.card_id[\s\S]+owned_variant\.set_id\s*=\s*trade_offer_cards\.set_id[\s\S]+owned_variant\.quantity\s*>\s*0/,
]);

const DISPUTE_HELPER_ASSOCIATIONS = Object.freeze([
  /listing\.id\s*=\s*offer\.listing_id/,
  /listing\.user_id\s*=\s*offer\.receiver_id/,
  /listing\.flag_type\s*=\s*'trade'/,
  /offer\.id\s*=\s*p_offer_id/,
  /p_actor_id\s+in\s*\(offer\.sender_id,\s*offer\.receiver_id\)/,
  /exists\s*\([\s\S]{0,300}sender_card\.offer_id\s*=\s*offer\.id[\s\S]{0,160}sender_card\.owner_id\s*=\s*offer\.sender_id[\s\S]{0,80}\)/,
  /1\s*=\s*\([\s\n]*select\s+count\(\*\)[\s\S]{0,300}requested_card\.offer_id\s*=\s*offer\.id[\s\S]{0,160}requested_card\.owner_id\s*=\s*offer\.receiver_id[\s\S]{0,160}requested_card\.card_id\s*=\s*listing\.card_id[\s\S]{0,180}requested_card\.set_id\s+is\s+not\s+distinct\s+from\s+listing\.set_id[\s\S]{0,80}\)/,
  /not\s+exists\s*\([\s\S]{0,300}invalid_card\.offer_id\s*=\s*offer\.id[\s\S]{0,220}invalid_card\.owner_id\s*=\s*offer\.sender_id[\s\S]{0,220}invalid_card\.owner_id\s*=\s*offer\.receiver_id[\s\S]{0,180}invalid_card\.card_id\s*=\s*listing\.card_id[\s\S]{0,180}invalid_card\.set_id\s+is\s+not\s+distinct\s+from\s+listing\.set_id[\s\S]{0,100}\)/,
  /not\s+exists\s*\([\s\S]{0,260}cash_terms\.offer_id\s*=\s*offer\.id[\s\S]{0,80}\)/,
]);

const MEMBERSHIP_GUARD_ASSOCIATIONS = Object.freeze([
  /select\s+offer\.listing_id[\s\S]{0,220}from\s+public\.trade_offers\s+as\s+offer[\s\S]{0,120}where\s+offer\.id\s*=\s*new\.offer_id/,
  /select\s+listing\.card_id,\s*listing\.set_id[\s\S]{0,220}from\s+public\.user_card_flags\s+as\s+listing[\s\S]{0,120}where\s+listing\.id\s*=\s*initial_listing_id[\s\S]{0,80}for\s+share/,
  /select\s+offer\.sender_id,\s*offer\.receiver_id,\s*offer\.listing_id[\s\S]{0,260}from\s+public\.trade_offers\s+as\s+offer[\s\S]{0,120}where\s+offer\.id\s*=\s*new\.offer_id[\s\S]{0,80}for\s+update/,
  /offer_listing_id\s+is\s+distinct\s+from\s+initial_listing_id/,
  /actor_id\s+is\s+distinct\s+from\s+offer_sender_id/,
  /new\.owner_id\s*=\s*offer_receiver_id[\s\S]+new\.card_id\s+is\s+distinct\s+from\s+listing_card_id[\s\S]+new\.set_id\s+is\s+distinct\s+from\s+listing_set_id/,
  /existing_requested_card\.offer_id\s*=\s*new\.offer_id/,
  /existing_requested_card\.owner_id\s*=\s*offer_receiver_id/,
  /new\.owner_id\s*=\s*offer_sender_id[\s\S]+from\s+public\.user_card_variants\s+as\s+owned_variant[\s\S]+owned_variant\.user_id\s*=\s*offer_sender_id[\s\S]+owned_variant\.card_id\s*=\s*new\.card_id[\s\S]+owned_variant\.set_id\s*=\s*new\.set_id[\s\S]+owned_variant\.quantity\s*>\s*0[\s\S]+for\s+update/,
]);

export function verifyCatalogCardTradeAssociations({
  boundOfferPolicyCheck,
  participantCardPolicyCheck,
  disputeHelperDefinition,
  membershipGuardDefinition,
}) {
  const errors = [];
  if (!matchesEveryAssociation(
    boundOfferPolicyCheck,
    BOUND_OFFER_POLICY_ASSOCIATIONS,
  )) errors.push('gate0_bound_offer_policy_association_drift');
  if (!matchesEveryAssociation(
    participantCardPolicyCheck,
    PARTICIPANT_CARD_POLICY_ASSOCIATIONS,
  )) errors.push('gate0_participant_card_policy_association_drift');
  if (!matchesEveryAssociation(
    disputeHelperDefinition,
    DISPUTE_HELPER_ASSOCIATIONS,
  )) errors.push('gate0_dispute_helper_association_drift');
  if (!matchesEveryAssociation(
    membershipGuardDefinition,
    MEMBERSHIP_GUARD_ASSOCIATIONS,
  )) errors.push('gate0_membership_guard_association_drift');
  return errors;
}

export function verifyGlobalFunctionDefaultContracts(contracts) {
  const errors = [];
  if (!Array.isArray(contracts) || contracts.length === 0) {
    return ['gate0_global_function_default_acl_owner_inventory_missing'];
  }
  for (const contract of contracts) {
    const role = contract.owner_role;
    if (typeof role !== 'string' || role.length === 0
      || Number(contract.global_function_acl_rows) !== 1) {
      errors.push(`gate0_global_function_default_acl_missing:${role ?? 'unknown'}`);
      continue;
    }
    if (Number(contract.unsafe_grant_count) !== 0) {
      errors.push(`gate0_global_function_default_acl_unsafe:${role}`);
    }
  }
  return errors;
}

export function verifyPreApplyFunctionDefaultContracts(contracts) {
  const errors = [];
  if (!Array.isArray(contracts) || contracts.length === 0) {
    return ['gate0_global_function_default_acl_owner_inventory_missing'];
  }
  for (const contract of contracts) {
    if (contract.executor_can_alter === true) continue;
    errors.push(...verifyGlobalFunctionDefaultContracts([contract]));
  }
  return errors;
}

export function expectedProtectedFunctionAclMatrix() {
  return PROTECTED_FUNCTION_SIGNATURES.map((signature) => {
    const expected = PROTECTED_FUNCTION_EXECUTE_ALLOWLIST.get(signature)
      ?? { anon: false, authenticated: false, service: false };
    return {
      signature,
      owner_role: 'postgres',
      public_execute: false,
      anon_execute: expected.anon,
      authenticated_execute: expected.authenticated,
      service_execute: expected.service,
    };
  });
}

export function verifyProtectedFunctionAclMatrix(functions) {
  const errors = [];
  if (!Array.isArray(functions)
    || functions.length !== EXPECTED_PROTECTED_FUNCTION_COUNT) {
    errors.push('gate0_protected_function_inventory_drift');
  }
  const bySignature = new Map(
    (functions ?? []).map((contract) => [contract.signature, contract]),
  );
  for (const signature of PROTECTED_FUNCTION_SIGNATURES) {
    if (!bySignature.has(signature)) {
      errors.push(`gate0_protected_function_missing:${signature}`);
    }
  }
  for (const contract of functions ?? []) {
    if (!PROTECTED_FUNCTION_SIGNATURES.includes(contract.signature)) {
      errors.push(`gate0_protected_function_unexpected:${contract.signature}`);
      continue;
    }
    const expected = PROTECTED_FUNCTION_EXECUTE_ALLOWLIST.get(contract.signature)
      ?? { anon: false, authenticated: false, service: false };
    if (contract.owner_role !== 'postgres') {
      errors.push(`gate0_protected_function_owner_drift:${contract.signature}`);
    }
    if (contract.public_execute !== false
      || contract.anon_execute !== expected.anon
      || contract.authenticated_execute !== expected.authenticated
      || contract.service_execute !== expected.service) {
      errors.push(`gate0_protected_function_acl_drift:${contract.signature}`);
    }
  }
  return errors;
}

export async function readFinancialStateCounts(client) {
  const counts = {};
  const fixedCounts = await client.query(`
    select
      (select count(*)::int from public.trade_cash_terms) as cash_terms,
      (select count(*)::int from public.trades) as legacy_fulfilment_rows,
      (select count(*)::int from public.trade_reviews) as trade_review_rows,
      (select count(*)::int from public.trader_ratings) as trader_rating_rows,
      (select count(*)::int from public.trade_offers) as trade_offer_rows,
      (select count(*)::int from public.trade_offer_events) as trade_offer_event_rows,
      (select count(*)::int from public.trade_offer_cards) as trade_offer_card_rows,
      (
        select count(*)::int
        from public.trade_offers as offer
        where offer.sender_id = offer.receiver_id
          or offer.listing_id is null
          or not exists (
            select 1
            from public.user_card_flags as listing
            where listing.id = offer.listing_id
              and listing.user_id = offer.receiver_id
              and listing.flag_type = 'trade'
          )
      ) as invalid_trade_offer_bindings,
      (
        select count(*)::int
        from public.trade_offers as offer
        where offer.status = 'disputed'
          and (
            not exists (
              select 1
              from public.trade_offer_cards as sender_card
              where sender_card.offer_id = offer.id
                and sender_card.owner_id = offer.sender_id
            )
            or 1 <> (
              select count(*)
              from public.user_card_flags as listing
              join public.trade_offer_cards as requested_card
                on requested_card.offer_id = offer.id
                and requested_card.owner_id = offer.receiver_id
                and requested_card.card_id = listing.card_id
                and requested_card.set_id is not distinct from listing.set_id
              where listing.id = offer.listing_id
                and listing.user_id = offer.receiver_id
                and listing.flag_type = 'trade'
            )
            or exists (
              select 1
              from public.trade_offer_cards as invalid_card
              where invalid_card.offer_id = offer.id
                and not (
                  invalid_card.owner_id = offer.sender_id
                  or (
                    invalid_card.owner_id = offer.receiver_id
                    and exists (
                      select 1
                      from public.user_card_flags as listing
                      where listing.id = offer.listing_id
                        and listing.user_id = offer.receiver_id
                        and listing.flag_type = 'trade'
                        and invalid_card.card_id = listing.card_id
                        and invalid_card.set_id is not distinct from listing.set_id
                    )
                  )
                )
            )
            or exists (
              select 1
              from public.trade_cash_terms as cash_terms
              where cash_terms.offer_id = offer.id
            )
          )
      ) as invalid_disputed_trade_offers,
      (
        select count(*)::int
        from public.trade_offer_cards as offer_card
        where not exists (
          select 1
          from public.trade_offers as offer
          join public.user_card_flags as listing
            on listing.id = offer.listing_id
            and listing.user_id = offer.receiver_id
            and listing.flag_type = 'trade'
          where offer.id = offer_card.offer_id
            and (
              offer_card.owner_id = offer.sender_id
              or (
                offer_card.owner_id = offer.receiver_id
                and offer_card.card_id = listing.card_id
                and offer_card.set_id is not distinct from listing.set_id
              )
            )
        )
      ) as invalid_trade_offer_card_owners,
      (
        select count(*)::int
        from public.trade_offers
        where status in ('payment_required', 'payment_sent', 'payment_confirmed')
      ) as payment_trade_offers,
      (
        select count(*)::int
        from public.trade_offer_events
        where proposed_cash_amount is not null
          or event_type in ('payment_required', 'payment_sent', 'payment_confirmed')
          or proposed_status in ('payment_required', 'payment_sent', 'payment_confirmed')
      ) as financial_trade_events,
      (
        select count(*)::int
        from public.trade_offer_events as event
        where (
          event.event_type = 'disputed'
          or event.proposed_status = 'disputed'
        )
          and not exists (
            select 1
            from public.trade_offers as offer
            join public.user_card_flags as listing
              on listing.id = offer.listing_id
              and listing.user_id = offer.receiver_id
              and listing.flag_type = 'trade'
            where offer.id = event.offer_id
              and event.user_id in (offer.sender_id, offer.receiver_id)
              and exists (
                select 1
                from public.trade_offer_cards as sender_card
                where sender_card.offer_id = offer.id
                  and sender_card.owner_id = offer.sender_id
              )
              and 1 = (
                select count(*)
                from public.trade_offer_cards as requested_card
                where requested_card.offer_id = offer.id
                  and requested_card.owner_id = offer.receiver_id
                  and requested_card.card_id = listing.card_id
                  and requested_card.set_id is not distinct from listing.set_id
              )
              and not exists (
                select 1
                from public.trade_offer_cards as invalid_card
                where invalid_card.offer_id = offer.id
                  and not (
                    invalid_card.owner_id = offer.sender_id
                    or (
                      invalid_card.owner_id = offer.receiver_id
                      and invalid_card.card_id = listing.card_id
                      and invalid_card.set_id is not distinct from listing.set_id
                    )
                  )
              )
              and not exists (
                select 1
                from public.trade_cash_terms as cash_terms
                where cash_terms.offer_id = offer.id
              )
          )
      ) as invalid_disputed_events,
      (
        select count(*)::int
        from public.trade_offers
        where status is null
          or status not in (
          'pending', 'accepted', 'declined', 'cancelled', 'disputed'
        )
          or sender_sent is distinct from false
          or receiver_sent is distinct from false
          or sender_received is distinct from false
          or receiver_received is distinct from false
          or completed_at is not null
      ) as fulfilment_trade_offers,
      (
        select count(*)::int
        from public.trade_offer_events
        where event_type is null
          or event_type not in (
          'offer_created',
          'message',
          'counter_offer',
          'pending',
          'accepted',
          'declined',
          'cancelled',
          'disputed'
        )
          or proposed_status not in (
            'pending', 'accepted', 'declined', 'cancelled', 'disputed'
          )
      ) as fulfilment_trade_events,
      (
        select count(*)::int
        from public.user_card_flags
        where payment_intent_id is not null
      ) as listing_payment_bindings,
      (
        select count(*)::int
        from public.user_card_flags
        where flag_type = 'trade'
      ) as trade_listing_rows,
      (
        select count(*)::int
        from public.user_card_flags
        where flag_type = 'trade'
          and coalesce(listing_status, 'active') = 'active'
      ) as active_trade_listings,
      (
        select count(*)::int
        from public.user_card_flags
        where flag_type = 'trade'
          and listing_status = 'archived'
      ) as archived_trade_listings,
      (
        select count(*)::int
        from public.user_card_flags
        where listing_status = 'sold'
      ) as sold_listing_states,
      (
        select count(*)::int
        from public.user_card_flags as listing
        where listing.flag_type = 'trade'
          and coalesce(listing.listing_status, 'active') = 'active'
          and not exists (
            select 1
            from auth.users as listing_owner
            where listing_owner.id = listing.user_id
              and coalesce(
                listing_owner.raw_app_meta_data
                  -> 'stackr_premium_seller' = 'true'::jsonb,
                false
              )
          )
      ) as unentitled_active_trade_listings,
      (
        select count(*)::int
        from public.profiles
        where stripe_account_id is not null
      ) as profile_stripe_bindings
  `);
  Object.assign(counts, fixedCounts.rows[0]);

  if ((await client.query(
    "select to_regclass('public.family_purchase_requests') is not null as present",
  )).rows[0].present) {
    counts.family_purchase_requests = Number((await client.query(
      'select count(*)::int as count from public.family_purchase_requests',
    )).rows[0].count);
  } else {
    counts.family_purchase_requests = 0;
  }

  if ((await client.query(
    "select to_regclass('public.trade_listings') is not null as present",
  )).rows[0].present) {
    counts.legacy_trade_listings = Number((await client.query(
      'select count(*)::int as count from public.trade_listings',
    )).rows[0].count);
  } else {
    counts.legacy_trade_listings = 0;
  }

  if ((await client.query(
    "select to_regclass('public.marketplace_listings') is not null as present",
  )).rows[0].present) {
    counts.legacy_marketplace_listings = Number((await client.query(
      'select count(*)::int as count from public.marketplace_listings',
    )).rows[0].count);
  } else {
    counts.legacy_marketplace_listings = 0;
  }

  return Object.fromEntries(
    Object.entries(counts).map(([name, value]) => [name, Number(value)]),
  );
}

// This is a deployment-baseline assertion, not a permanent reservation rule.
// New sender card rows take a locked ownership snapshot in the INSERT trigger;
// later legitimate binder depletion does not retroactively invalidate history.
export async function readPreApplySenderOfferCardOwnershipCount(client) {
  const ownership = await client.query(`
    select count(*)::int as count
    from public.trade_offer_cards as offer_card
    join public.trade_offers as offer
      on offer.id = offer_card.offer_id
      and offer.sender_id = offer_card.owner_id
    where not exists (
      select 1
      from public.user_card_variants as owned_variant
      where owned_variant.user_id = offer.sender_id
        and owned_variant.card_id = offer_card.card_id
        and owned_variant.set_id = offer_card.set_id
        and owned_variant.quantity > 0
    )
  `);
  if (ownership.rowCount !== 1 || ownership.rows.length !== 1) {
    throw new Error('gate0_sender_offer_card_ownership_count_invalid');
  }
  return Number(ownership.rows[0].count);
}

export async function readCatalogSnapshot(client) {
  const migration = await client.query(`
    select exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = $1
        and name = 'gate0_financial_route_containment'
    ) as applied
  `, [GATE0_MIGRATION_VERSION]);

  const markerInventory = await client.query(`
    select
      (
        select count(*)::int
        from pg_catalog.pg_constraint
        where conname like 'stackr_gate0_%'
      ) as constraint_markers,
      (
        select count(*)::int
        from pg_catalog.pg_trigger
        where not tgisinternal
          and tgname like 'stackr_gate0_%'
      ) as trigger_markers,
      (
        select count(*)::int
        from pg_catalog.pg_policy
        where polname like 'Stackr Gate 0%'
      ) as policy_markers,
      (
        select count(*)::int
        from pg_catalog.pg_proc
        where proname like 'stackr_gate0_%'
      ) as function_markers
  `);

  const rls = await client.query(`
    select
      relation_schema.nspname as schema_name,
      relation.relname as table_name,
      relation.relrowsecurity as enabled
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    where (
      relation_schema.nspname = 'public'
      and relation.relname in (
        'trade_cash_terms',
        'trades',
        'trade_offers',
        'trade_offer_cards',
        'trade_offer_events',
        'user_card_flags',
        'profiles',
        'trade_reviews',
        'trader_ratings',
        'family_purchase_requests',
        'seller_inventory_items',
        'inventory_movements',
        'seller_sale_transactions',
        'seller_sale_transaction_items',
        'trade_listings',
        'marketplace_listings'
      )
    ) or (
      relation_schema.nspname = 'private'
      and relation.relname = 'seller_inventory_batch_commits'
    )
  `);

  const constraints = await client.query(`
    select
      relation.relname as table_name,
      constraint_record.conname as constraint_name,
      constraint_record.convalidated as validated,
      pg_catalog.pg_get_constraintdef(constraint_record.oid, true) as definition
    from pg_catalog.pg_constraint as constraint_record
    join pg_catalog.pg_class as relation
      on relation.oid = constraint_record.conrelid
    join pg_catalog.pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    where relation_schema.nspname = 'public'
      and constraint_record.conname in (
        'stackr_gate0_cash_terms_disabled',
        'stackr_gate0_legacy_trade_fulfilment_disabled',
        'stackr_gate0_trade_reviews_disabled',
        'stackr_gate0_trader_ratings_disabled',
        'stackr_gate0_financial_events_disabled',
        'stackr_gate0_fulfilment_events_disabled',
        'stackr_gate0_offer_listing_binding_required',
        'stackr_gate0_payment_statuses_disabled',
        'stackr_gate0_fulfilment_states_disabled',
        'stackr_gate0_listing_payment_binding_disabled',
        'stackr_gate0_listing_sold_state_disabled',
        'stackr_gate0_family_purchases_disabled',
        'stackr_gate0_legacy_trade_listings_disabled',
        'stackr_gate0_legacy_marketplace_listings_disabled'
      )
  `);

  const triggers = await client.query(`
    select
      relation.relname as table_name,
      trigger_record.tgname as trigger_name,
      trigger_record.tgenabled as enabled,
      trigger_record.tgfoid::pg_catalog.regprocedure::text as function_signature,
      (trigger_record.tgtype & 1) <> 0 as row_level,
      (trigger_record.tgtype & 2) <> 0 as before_event,
      (trigger_record.tgtype & 4) <> 0 as on_insert,
      (trigger_record.tgtype & 8) <> 0 as on_delete,
      (trigger_record.tgtype & 16) <> 0 as on_update,
      (trigger_record.tgtype & 32) <> 0 as on_truncate,
      (trigger_record.tgtype & 64) <> 0 as instead_of,
      pg_catalog.pg_get_triggerdef(trigger_record.oid, true) as definition
    from pg_catalog.pg_trigger as trigger_record
    join pg_catalog.pg_class as relation
      on relation.oid = trigger_record.tgrelid
    join pg_catalog.pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    where relation_schema.nspname in ('public', 'private')
      and not trigger_record.tgisinternal
      and trigger_record.tgname in (
        'stackr_gate0_block_cash_terms',
        'stackr_gate0_block_legacy_trade_fulfilment',
        'stackr_gate0_block_trade_reviews',
        'stackr_gate0_block_trader_ratings',
        'stackr_gate0_guard_trade_offer_financial_state',
        'stackr_gate0_guard_trade_event_financial_state',
        'stackr_gate0_guard_trade_offer_card_membership',
        'stackr_gate0_guard_listing_financial_state',
        'stackr_gate0_guard_profile_financial_binding',
        'stackr_gate0_block_family_purchases',
        'stackr_gate0_block_legacy_trade_listings',
        'stackr_gate0_block_legacy_marketplace_listings',
        'stackr_gate0_guard_seller_entitlement'
      )
  `);

  const policies = await client.query(`
    select
      schemaname as schema_name,
      tablename as table_name,
      policyname as policy_name,
      permissive,
      roles::text[] AS roles,
      cmd,
      qual,
      with_check
    from pg_catalog.pg_policies
    where schemaname in ('public', 'private')
      and policyname in (
        'Stackr Gate 0 hides cash terms',
        'Stackr Gate 0 freezes legacy fulfilment',
        'Stackr Gate 0 hides trade reviews',
        'Stackr Gate 0 hides trader ratings',
        'Stackr Gate 0 bound card offer inserts',
        'Stackr Gate 0 participant cards only',
        'Stackr Gate 0 hides purchase requests',
        'Stackr Gate 0 current listing visibility',
        'Stackr Gate 0 entitled listing inserts',
        'Stackr Gate 0 entitled listing updates',
        'Stackr Gate 0 entitled seller inserts',
        'Stackr Gate 0 entitled seller updates',
        'Stackr Gate 0 entitled seller deletes',
        'Stackr Gate 0 entitled seller batch commits',
        'Stackr Gate 0 entitled seller batch reads',
        'Stackr Gate 0 hides legacy trade listings',
        'Stackr Gate 0 hides legacy marketplace listings'
      )
  `);

  const tablePrivileges = await client.query(`
    with roles(role_name) as (
      values ('anon'), ('authenticated'), ('service_role')
    ), relations(table_name) as (
      values
        ('trade_cash_terms'),
        ('trades'),
        ('trade_reviews'),
        ('trader_ratings'),
        ('trade_offers'),
        ('trade_offer_cards'),
        ('trade_offer_events'),
        ('family_purchase_requests'),
        ('seller_inventory_items'),
        ('inventory_movements'),
        ('seller_sale_transactions'),
        ('seller_sale_transaction_items'),
        ('trade_listings'),
        ('marketplace_listings')
    ), privileges(privilege_name) as (
      values
        ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
        ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    )
    select
      relations.table_name,
      roles.role_name,
      privileges.privilege_name,
      pg_catalog.has_table_privilege(
        roles.role_name,
        pg_catalog.format('public.%I', relations.table_name),
        privileges.privilege_name
      ) as allowed
    from roles
    cross join relations
    cross join privileges
  `);

  const columnPrivileges = await client.query(`
    with targets(table_name, column_name, privilege_name) as (
      values
        ('user_card_flags', 'payment_intent_id', 'INSERT'),
        ('user_card_flags', 'payment_intent_id', 'UPDATE'),
        ('profiles', 'stripe_account_id', 'INSERT'),
        ('profiles', 'stripe_account_id', 'UPDATE'),
        ('trade_offers', 'sender_sent', 'INSERT'),
        ('trade_offers', 'sender_sent', 'UPDATE'),
        ('trade_offers', 'receiver_sent', 'INSERT'),
        ('trade_offers', 'receiver_sent', 'UPDATE'),
        ('trade_offers', 'sender_received', 'INSERT'),
        ('trade_offers', 'sender_received', 'UPDATE'),
        ('trade_offers', 'receiver_received', 'INSERT'),
        ('trade_offers', 'receiver_received', 'UPDATE'),
        ('trade_offers', 'completed_at', 'INSERT'),
        ('trade_offers', 'completed_at', 'UPDATE'),
        ('trade_offers', 'sender_id', 'UPDATE'),
        ('trade_offers', 'receiver_id', 'UPDATE'),
        ('trade_offers', 'listing_id', 'UPDATE'),
        ('trade_offers', 'from_user', 'UPDATE')
    ), roles(role_name) as (
      values ('anon'), ('authenticated'), ('service_role')
    )
    select
      targets.table_name,
      targets.column_name,
      roles.role_name,
      targets.privilege_name,
      pg_catalog.has_column_privilege(
        roles.role_name,
        pg_catalog.format('public.%I', targets.table_name),
        targets.column_name,
        targets.privilege_name
      ) as allowed
    from targets
    cross join roles
  `);

  const authenticatedProfileColumnPrivileges = await client.query(`
    with targets(column_name, privilege_name) as (
      values
        ('id', 'UPDATE'),
        ('email', 'INSERT'),
        ('email', 'UPDATE'),
        ('role', 'INSERT'),
        ('role', 'UPDATE'),
        ('stripe_account_id', 'INSERT'),
        ('stripe_account_id', 'UPDATE')
    )
    select
      targets.column_name,
      targets.privilege_name,
      pg_catalog.has_column_privilege(
        'authenticated',
        'public.profiles',
        targets.column_name,
        targets.privilege_name
      ) as allowed
    from targets
  `);

  const safeTradeOfferColumnPrivileges = await client.query(`
    with targets(role_name, column_name, privilege_name) as (
      values
        ('authenticated', 'sender_id', 'INSERT'),
        ('authenticated', 'status', 'INSERT'),
        ('authenticated', 'status', 'UPDATE'),
        ('authenticated', 'message', 'UPDATE'),
        ('authenticated', 'accepted_at', 'UPDATE'),
        ('authenticated', 'declined_at', 'UPDATE'),
        ('service_role', 'sender_id', 'INSERT'),
        ('service_role', 'status', 'INSERT'),
        ('service_role', 'status', 'UPDATE'),
        ('service_role', 'message', 'UPDATE'),
        ('service_role', 'accepted_at', 'UPDATE'),
        ('service_role', 'declined_at', 'UPDATE')
    )
    select
      targets.role_name,
      targets.column_name,
      targets.privilege_name,
      pg_catalog.has_column_privilege(
        targets.role_name,
        'public.trade_offers',
        targets.column_name,
        targets.privilege_name
      ) as allowed
    from targets
  `);

  const sequencePrivileges = await client.query(`
    with roles(role_name) as (
      values ('anon'), ('authenticated'), ('service_role')
    ), privileges(privilege_name) as (
      values ('USAGE'), ('SELECT'), ('UPDATE')
    )
    select
      roles.role_name,
      privileges.privilege_name,
      pg_catalog.has_sequence_privilege(
        roles.role_name,
        'public.seller_sale_transaction_items_id_seq',
        privileges.privilege_name
      ) as allowed
    from roles
    cross join privileges
  `);

  const sellerReceiptPrivileges = await client.query(`
    with roles(role_name) as (
      values ('anon'), ('authenticated'), ('service_role')
    ), privileges(privilege_name) as (
      values
        ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
        ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    )
    select
      roles.role_name,
      privileges.privilege_name,
      pg_catalog.has_table_privilege(
        roles.role_name,
        'private.seller_inventory_batch_commits',
        privileges.privilege_name
      ) as allowed
    from roles
    cross join privileges
  `);

  const functions = await client.query(`
    with signatures(signature, function_kind) as (
      values
        ('public.stackr_gate0_block_financial_write()', 'guard'),
        ('public.stackr_gate0_block_legacy_fulfilment_write()', 'guard'),
        ('public.stackr_gate0_guard_profile_financial_binding()', 'guard'),
        ('public.stackr_gate0_guard_listing_financial_state()', 'guard'),
        ('public.stackr_gate0_guard_trade_offer_financial_state()', 'guard'),
        ('public.stackr_gate0_guard_trade_event_financial_state()', 'guard'),
        ('public.stackr_gate0_guard_trade_offer_card_membership()', 'guard'),
        ('public.stackr_gate0_guard_seller_entitlement()', 'guard'),
        ('private.stackr_gate0_user_has_premium_seller(uuid)', 'entitlement_helper'),
        (
          'private.stackr_gate0_card_trade_dispute_allowed(uuid,uuid)',
          'dispute_helper'
        ),
        ('public.accept_trade_offer(uuid)', 'retired_rpc'),
        ('public.create_family_purchase_request(uuid,uuid)', 'retired_rpc'),
        ('public.respond_family_purchase_request(uuid,text)', 'retired_rpc'),
        (
          'public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)',
          'conditional_rpc'
        ),
        (
          'private.commit_seller_inventory_batch_delegate(text,jsonb,jsonb,jsonb,jsonb,jsonb)',
          'conditional_rpc_delegate'
        )
    )
    select
      signatures.signature,
      signatures.function_kind,
      function_record.oid is not null as present,
      coalesce(not function_record.prosecdef, false) as security_invoker,
      coalesce(function_record.prosecdef, false) as security_definer,
      owner_role.rolname as owner_role,
      coalesce(
        function_record.proconfig @> array['search_path=""'],
        false
      ) as empty_search_path,
      coalesce(not exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(
            function_record.proacl,
            pg_catalog.acldefault('f', function_record.proowner)
          )
        ) as privilege
        where privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
      ), false) as public_cannot_execute,
      coalesce(not pg_catalog.has_function_privilege(
        'anon', function_record.oid, 'EXECUTE'
      ), false) as anon_cannot_execute,
      coalesce(not pg_catalog.has_function_privilege(
        'authenticated', function_record.oid, 'EXECUTE'
      ), false) as authenticated_cannot_execute,
      coalesce(not pg_catalog.has_function_privilege(
        'service_role', function_record.oid, 'EXECUTE'
      ), false) as service_role_cannot_execute,
      coalesce(pg_catalog.pg_get_functiondef(function_record.oid), '') as definition
    from signatures
    left join pg_catalog.pg_proc as function_record
      on function_record.oid = pg_catalog.to_regprocedure(signatures.signature)
    left join pg_catalog.pg_roles as owner_role
      on owner_role.oid = function_record.proowner
  `);

  const defaultPrivileges = await client.query(`
    with required_owner(owner_role) as (
      select current_user::text
      union
      select distinct object_owner.rolname
      from pg_catalog.pg_proc as function_record
      join pg_catalog.pg_namespace as object_schema
        on object_schema.oid = function_record.pronamespace
      join pg_catalog.pg_roles as object_owner
        on object_owner.oid = function_record.proowner
      where object_schema.nspname in ('public', 'private')
      union
      select distinct object_owner.rolname
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as object_schema
        on object_schema.oid = relation.relnamespace
      join pg_catalog.pg_roles as object_owner
        on object_owner.oid = relation.relowner
      where object_schema.nspname in ('public', 'private')
    )
    select count(*)::int as unsafe_count
    from pg_catalog.pg_default_acl as defaults
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = defaults.defaclrole
    left join pg_catalog.pg_namespace as default_schema
      on default_schema.oid = defaults.defaclnamespace
    cross join lateral pg_catalog.aclexplode(defaults.defaclacl) as privilege
    left join pg_catalog.pg_roles as grantee_role
      on grantee_role.oid = privilege.grantee
    where owner_role.rolname in (select required_owner.owner_role from required_owner)
      and (
        defaults.defaclnamespace = 0
        or default_schema.nspname in ('public', 'private')
      )
      and defaults.defaclobjtype in ('r', 'S', 'f')
      and (
        privilege.grantee = 0
        or grantee_role.rolname in ('anon', 'authenticated', 'service_role')
      )
  `);

  const globalFunctionDefaultContracts = await client.query(`
    with required_owner(owner_role) as (
      select current_user::text
      union
      select distinct object_owner.rolname
      from pg_catalog.pg_proc as function_record
      join pg_catalog.pg_namespace as object_schema
        on object_schema.oid = function_record.pronamespace
      join pg_catalog.pg_roles as object_owner
        on object_owner.oid = function_record.proowner
      where object_schema.nspname in ('public', 'private')
      union
      select distinct object_owner.rolname
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as object_schema
        on object_schema.oid = relation.relnamespace
      join pg_catalog.pg_roles as object_owner
        on object_owner.oid = relation.relowner
      where object_schema.nspname in ('public', 'private')
    )
    select
      required_owner.owner_role,
      pg_catalog.pg_has_role(
        current_user,
        required_owner.owner_role,
        'MEMBER'
      ) as executor_can_alter,
      (
        select count(*)::int
        from pg_catalog.pg_default_acl as defaults
        join pg_catalog.pg_roles as owner_role
          on owner_role.oid = defaults.defaclrole
        where owner_role.rolname = required_owner.owner_role
          and defaults.defaclnamespace = 0
          and defaults.defaclobjtype = 'f'
      ) as global_function_acl_rows,
      (
        select count(*)::int
        from pg_catalog.pg_default_acl as defaults
        join pg_catalog.pg_roles as owner_role
          on owner_role.oid = defaults.defaclrole
        cross join lateral pg_catalog.aclexplode(defaults.defaclacl) as privilege
        left join pg_catalog.pg_roles as grantee_role
          on grantee_role.oid = privilege.grantee
        where owner_role.rolname = required_owner.owner_role
          and defaults.defaclnamespace = 0
          and defaults.defaclobjtype = 'f'
          and privilege.privilege_type = 'EXECUTE'
          and (
            privilege.grantee = 0
            or grantee_role.rolname in ('anon', 'authenticated', 'service_role')
          )
      ) as unsafe_grant_count
    from required_owner
    order by required_owner.owner_role
  `);

  const protectedFunctionAcls = await client.query(`
    select
      pg_catalog.format(
        '%I.%I(%s)',
        function_schema.nspname,
        function_record.proname,
        replace(
          pg_catalog.oidvectortypes(function_record.proargtypes),
          ', ',
          ','
        )
      ) as signature,
      owner_role.rolname as owner_role,
      exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(
            function_record.proacl,
            pg_catalog.acldefault('f', function_record.proowner)
          )
        ) as privilege
        where privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
      ) as public_execute,
      pg_catalog.has_function_privilege(
        'anon', function_record.oid, 'EXECUTE'
      ) as anon_execute,
      pg_catalog.has_function_privilege(
        'authenticated', function_record.oid, 'EXECUTE'
      ) as authenticated_execute,
      pg_catalog.has_function_privilege(
        'service_role', function_record.oid, 'EXECUTE'
      ) as service_execute
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as function_schema
      on function_schema.oid = function_record.pronamespace
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = function_record.proowner
    where function_schema.nspname in ('public', 'private')
    order by signature
  `);

  return {
    migrationApplied: migration.rows[0].applied,
    markerInventory: Object.fromEntries(
      Object.entries(markerInventory.rows[0])
        .map(([name, value]) => [name, Number(value)]),
    ),
    rls: rls.rows,
    constraints: constraints.rows,
    triggers: triggers.rows,
    policies: policies.rows,
    tablePrivileges: tablePrivileges.rows,
    columnPrivileges: columnPrivileges.rows,
    authenticatedProfileColumnPrivileges:
      authenticatedProfileColumnPrivileges.rows,
    safeTradeOfferColumnPrivileges: safeTradeOfferColumnPrivileges.rows,
    sequencePrivileges: sequencePrivileges.rows,
    sellerReceiptPrivileges: sellerReceiptPrivileges.rows,
    functions: functions.rows,
    unsafeDefaultPrivilegeCount: Number(defaultPrivileges.rows[0].unsafe_count),
    globalFunctionDefaultContracts: globalFunctionDefaultContracts.rows,
    protectedFunctionAcls: protectedFunctionAcls.rows,
  };
}

export function verifyCatalog(snapshot) {
  const errors = [];

  for (const [marker, expected] of Object.entries({
    constraint_markers: 14,
    trigger_markers: 17,
    policy_markers: 26,
    function_markers: 10,
  })) {
    if (snapshot.markerInventory?.[marker] !== expected) {
      errors.push(`gate0_marker_inventory_drift:${marker}`);
    }
  }

  errors.push(...verifyGlobalFunctionDefaultContracts(
    snapshot.globalFunctionDefaultContracts ?? [],
  ));
  errors.push(...verifyProtectedFunctionAclMatrix(
    snapshot.protectedFunctionAcls ?? [],
  ));

  const requiredRlsTables = [
    'trade_cash_terms',
    'trades',
    'trade_offers',
    'trade_offer_cards',
    'trade_offer_events',
    'user_card_flags',
    'profiles',
    'trade_reviews',
    'trader_ratings',
    'family_purchase_requests',
    'seller_inventory_items',
    'inventory_movements',
    'seller_sale_transactions',
    'seller_sale_transaction_items',
    'seller_inventory_batch_commits',
    'trade_listings',
    'marketplace_listings',
  ];
  const rls = mapBy(snapshot.rls, (row) => row.table_name);
  for (const tableName of requiredRlsTables) {
    if (rls.get(tableName)?.enabled !== true) {
      errors.push(`gate0_rls_missing:${tableName}`);
    }
  }

  const requiredConstraints = new Map([
    ['trade_cash_terms.stackr_gate0_cash_terms_disabled', /CHECK \(false\).*NOT VALID/i],
    ['trades.stackr_gate0_legacy_trade_fulfilment_disabled', /CHECK \(false\).*NOT VALID/i],
    ['trade_reviews.stackr_gate0_trade_reviews_disabled', /CHECK \(false\).*NOT VALID/i],
    ['trader_ratings.stackr_gate0_trader_ratings_disabled', /CHECK \(false\).*NOT VALID/i],
    ['trade_offer_events.stackr_gate0_financial_events_disabled', /proposed_cash_amount is null/i],
    [
      'trade_offer_events.stackr_gate0_fulfilment_events_disabled',
      /event_type is not null[\s\S]*offer_created[\s\S]*disputed/i,
    ],
    [
      'trade_offers.stackr_gate0_offer_listing_binding_required',
      /listing_id is not null[\s\S]*sender_id <> receiver_id/i,
    ],
    ['trade_offers.stackr_gate0_payment_statuses_disabled', /payment_required/i],
    [
      'trade_offers.stackr_gate0_fulfilment_states_disabled',
      /status is not null[\s\S]*pending[\s\S]*disputed[\s\S]*sender_sent is false/i,
    ],
    ['user_card_flags.stackr_gate0_listing_payment_binding_disabled', /payment_intent_id is null/i],
    ['user_card_flags.stackr_gate0_listing_sold_state_disabled', /listing_status.*sold/i],
    ['family_purchase_requests.stackr_gate0_family_purchases_disabled', /CHECK \(false\).*NOT VALID/i],
    ['trade_listings.stackr_gate0_legacy_trade_listings_disabled', /CHECK \(false\).*NOT VALID/i],
    ['marketplace_listings.stackr_gate0_legacy_marketplace_listings_disabled', /CHECK \(false\).*NOT VALID/i],
  ]);
  const constraints = mapBy(
    snapshot.constraints,
    (row) => key(row.table_name, row.constraint_name),
  );
  for (const [constraintKey, definitionPattern] of requiredConstraints) {
    const constraint = constraints.get(constraintKey);
    if (!constraint || constraint.validated !== false
      || !definitionPattern.test(constraint.definition)) {
      errors.push(`gate0_constraint_missing:${constraintKey}`);
    }
  }

  const allMutationEvents = Object.freeze({ insert: true, update: true, delete: true });
  const requiredTriggers = new Map([
    ['trade_cash_terms.stackr_gate0_block_cash_terms', ['stackr_gate0_block_financial_write()', allMutationEvents]],
    ['trades.stackr_gate0_block_legacy_trade_fulfilment', ['stackr_gate0_block_legacy_fulfilment_write()', allMutationEvents]],
    ['trade_reviews.stackr_gate0_block_trade_reviews', ['stackr_gate0_block_legacy_fulfilment_write()', allMutationEvents]],
    ['trader_ratings.stackr_gate0_block_trader_ratings', ['stackr_gate0_block_legacy_fulfilment_write()', allMutationEvents]],
    ['trade_offers.stackr_gate0_guard_trade_offer_financial_state', ['stackr_gate0_guard_trade_offer_financial_state()', allMutationEvents]],
    ['trade_offer_events.stackr_gate0_guard_trade_event_financial_state', ['stackr_gate0_guard_trade_event_financial_state()', allMutationEvents]],
    ['trade_offer_cards.stackr_gate0_guard_trade_offer_card_membership', ['stackr_gate0_guard_trade_offer_card_membership()', allMutationEvents]],
    ['user_card_flags.stackr_gate0_guard_listing_financial_state', ['stackr_gate0_guard_listing_financial_state()', allMutationEvents]],
    ['profiles.stackr_gate0_guard_profile_financial_binding', ['stackr_gate0_guard_profile_financial_binding()', { insert: true, update: true, delete: false }]],
    ['family_purchase_requests.stackr_gate0_block_family_purchases', ['stackr_gate0_block_financial_write()', allMutationEvents]],
    ['trade_listings.stackr_gate0_block_legacy_trade_listings', ['stackr_gate0_block_financial_write()', allMutationEvents]],
    ['marketplace_listings.stackr_gate0_block_legacy_marketplace_listings', ['stackr_gate0_block_financial_write()', allMutationEvents]],
    ['seller_inventory_items.stackr_gate0_guard_seller_entitlement', ['stackr_gate0_guard_seller_entitlement()', allMutationEvents]],
    ['inventory_movements.stackr_gate0_guard_seller_entitlement', ['stackr_gate0_guard_seller_entitlement()', allMutationEvents]],
    ['seller_sale_transactions.stackr_gate0_guard_seller_entitlement', ['stackr_gate0_guard_seller_entitlement()', allMutationEvents]],
    ['seller_sale_transaction_items.stackr_gate0_guard_seller_entitlement', ['stackr_gate0_guard_seller_entitlement()', allMutationEvents]],
    ['seller_inventory_batch_commits.stackr_gate0_guard_seller_entitlement', ['stackr_gate0_guard_seller_entitlement()', allMutationEvents]],
  ]);
  const triggers = mapBy(snapshot.triggers, (row) => key(row.table_name, row.trigger_name));
  for (const [triggerKey, [functionSignature, events]] of requiredTriggers) {
    const trigger = triggers.get(triggerKey);
    if (!trigger || trigger.enabled !== 'O'
      || trigger.function_signature !== functionSignature
      || trigger.row_level !== true
      || trigger.before_event !== true
      || trigger.on_insert !== events.insert
      || trigger.on_update !== events.update
      || trigger.on_delete !== events.delete
      || trigger.on_truncate !== false
      || trigger.instead_of !== false) {
      errors.push(`gate0_trigger_missing:${triggerKey}`);
    }
  }

  const policies = mapBy(snapshot.policies, (row) => key(row.table_name, row.policy_name));
  for (const policyKey of [
    'trade_cash_terms.Stackr Gate 0 hides cash terms',
    'trades.Stackr Gate 0 freezes legacy fulfilment',
    'trade_reviews.Stackr Gate 0 hides trade reviews',
    'trader_ratings.Stackr Gate 0 hides trader ratings',
    'family_purchase_requests.Stackr Gate 0 hides purchase requests',
    'trade_listings.Stackr Gate 0 hides legacy trade listings',
    'marketplace_listings.Stackr Gate 0 hides legacy marketplace listings',
  ]) {
    const policy = policies.get(policyKey);
    if (!policy || policy.permissive !== 'RESTRICTIVE' || policy.cmd !== 'ALL'
      || policy.qual !== 'false' || policy.with_check !== 'false'
      || !hasExactPolicyRoles(policy, ['anon', 'authenticated'])) {
      errors.push(`gate0_restrictive_policy_missing:${policyKey}`);
    }
  }
  const boundOfferPolicy = policies.get(
    'trade_offers.Stackr Gate 0 bound card offer inserts',
  );
  if (!boundOfferPolicy || boundOfferPolicy.permissive !== 'RESTRICTIVE'
    || boundOfferPolicy.cmd !== 'INSERT'
    || !hasExactPolicyRoles(boundOfferPolicy, ['authenticated'])
    || !/auth\.uid/.test(boundOfferPolicy.with_check ?? '')
    || !/sender_id/.test(boundOfferPolicy.with_check ?? '')
    || !/receiver_id/.test(boundOfferPolicy.with_check ?? '')
    || !/listing_id/.test(boundOfferPolicy.with_check ?? '')
    || !/flag_type/.test(boundOfferPolicy.with_check ?? '')
    || !/listing_status/.test(boundOfferPolicy.with_check ?? '')
    || !/stackr_gate0_user_has_premium_seller/.test(
      boundOfferPolicy.with_check ?? '',
    )) {
    errors.push('gate0_bound_card_offer_policy_missing');
  }
  const participantPolicy = policies.get(
    'trade_offer_cards.Stackr Gate 0 participant cards only',
  );
  if (!participantPolicy || participantPolicy.permissive !== 'RESTRICTIVE'
    || participantPolicy.cmd !== 'INSERT'
    || !hasExactPolicyRoles(participantPolicy, ['authenticated'])
    || !/sender_id/.test(participantPolicy.with_check ?? '')
    || !/receiver_id/.test(participantPolicy.with_check ?? '')
    || !/owner_id/.test(participantPolicy.with_check ?? '')
    || !/auth\.uid/.test(participantPolicy.with_check ?? '')
    || !/user_card_flags/.test(participantPolicy.with_check ?? '')
    || !/user_card_variants/.test(participantPolicy.with_check ?? '')
    || !/trade_offer_cards\.card_id = listing\.card_id/.test(
      participantPolicy.with_check ?? '',
    )
    || !/(?:trade_offer_cards\.set_id\s+is\s+not\s+distinct\s+from\s+listing\.set_id|not\s*\(\s*trade_offer_cards\.set_id\s+is\s+distinct\s+from\s+listing\.set_id\s*\))/i.test(
      participantPolicy.with_check ?? '',
    )
    || !/owned_variant\.user_id = offer\.sender_id/.test(
      participantPolicy.with_check ?? '',
    )
    || !/owned_variant\.card_id = trade_offer_cards\.card_id/.test(
      participantPolicy.with_check ?? '',
    )
    || !/owned_variant\.set_id = trade_offer_cards\.set_id/.test(
      participantPolicy.with_check ?? '',
    )
    || !/owned_variant\.quantity > 0/.test(participantPolicy.with_check ?? '')) {
    errors.push('gate0_requested_card_policy_missing');
  }

  const functions = mapBy(
    snapshot.functions,
    (functionContract) => functionContract.signature,
  );
  errors.push(...verifyCatalogCardTradeAssociations({
    boundOfferPolicyCheck: boundOfferPolicy?.with_check,
    participantCardPolicyCheck: participantPolicy?.with_check,
    disputeHelperDefinition: functions.get(
      'private.stackr_gate0_card_trade_dispute_allowed(uuid,uuid)',
    )?.definition,
    membershipGuardDefinition: functions.get(
      'public.stackr_gate0_guard_trade_offer_card_membership()',
    )?.definition,
  }));

  const listingVisibilityPolicy = policies.get(
    'user_card_flags.Stackr Gate 0 current listing visibility',
  );
  if (!listingVisibilityPolicy
    || listingVisibilityPolicy.permissive !== 'RESTRICTIVE'
    || listingVisibilityPolicy.cmd !== 'SELECT'
    || !hasExactPolicyRoles(listingVisibilityPolicy, ['anon', 'authenticated'])
    || !/stackr_gate0_user_has_premium_seller/.test(listingVisibilityPolicy.qual ?? '')
    || !/auth\.uid/.test(listingVisibilityPolicy.qual ?? '')
    || /auth\.jwt|user_metadata/.test(listingVisibilityPolicy.qual ?? '')) {
    errors.push('gate0_current_listing_visibility_policy_missing');
  }

  for (const [policyKey, command] of [
    ['user_card_flags.Stackr Gate 0 entitled listing inserts', 'INSERT'],
    ['user_card_flags.Stackr Gate 0 entitled listing updates', 'UPDATE'],
  ]) {
    const policy = policies.get(policyKey);
    const entitlementExpression = policy?.with_check ?? '';
    if (!policy || policy.permissive !== 'RESTRICTIVE' || policy.cmd !== command
      || !hasExactPolicyRoles(policy, ['authenticated'])
      || !/flag_type/.test(entitlementExpression)
      || !/listing_status/.test(entitlementExpression)
      || !/stackr_gate0_user_has_premium_seller/.test(entitlementExpression)
      || /auth\.jwt|user_metadata/.test(entitlementExpression)) {
      errors.push(`gate0_listing_entitlement_policy_missing:${command}`);
    }
  }

  const sellerPolicyContracts = [
    ['Stackr Gate 0 entitled seller inserts', 'INSERT', false, true],
    ['Stackr Gate 0 entitled seller updates', 'UPDATE', true, true],
    ['Stackr Gate 0 entitled seller deletes', 'DELETE', true, false],
  ];
  for (const tableName of [
    'seller_inventory_items',
    'inventory_movements',
    'seller_sale_transactions',
    'seller_sale_transaction_items',
  ]) {
    for (const [policyName, command, requiresUsing, requiresCheck]
      of sellerPolicyContracts) {
      const policy = policies.get(`${tableName}.${policyName}`);
      const combinedExpression = `${policy?.qual ?? ''} ${policy?.with_check ?? ''}`;
      if (!policy || policy.permissive !== 'RESTRICTIVE' || policy.cmd !== command
        || !hasExactPolicyRoles(policy, ['authenticated'])
        || (requiresUsing && !policy.qual)
        || (requiresCheck && !policy.with_check)
        || !/stackr_gate0_user_has_premium_seller/.test(combinedExpression)
        || /auth\.jwt|user_metadata/.test(combinedExpression)) {
        errors.push(`gate0_seller_entitlement_policy_missing:${tableName}:${command}`);
      }
    }
  }
  const sellerBatchPolicy = policies.get(
    'seller_inventory_batch_commits.Stackr Gate 0 entitled seller batch commits',
  );
  if (!sellerBatchPolicy || sellerBatchPolicy.schema_name !== 'private'
    || sellerBatchPolicy.permissive !== 'RESTRICTIVE'
    || sellerBatchPolicy.cmd !== 'INSERT'
    || !hasExactPolicyRoles(sellerBatchPolicy, ['authenticated'])
    || !/stackr_gate0_user_has_premium_seller/.test(sellerBatchPolicy.with_check ?? '')
    || /auth\.jwt|user_metadata/.test(sellerBatchPolicy.with_check ?? '')) {
    errors.push('gate0_seller_batch_entitlement_policy_missing');
  }
  const sellerBatchReadPolicy = policies.get(
    'seller_inventory_batch_commits.Stackr Gate 0 entitled seller batch reads',
  );
  if (!sellerBatchReadPolicy || sellerBatchReadPolicy.schema_name !== 'private'
    || sellerBatchReadPolicy.permissive !== 'RESTRICTIVE'
    || sellerBatchReadPolicy.cmd !== 'SELECT'
    || !hasExactPolicyRoles(sellerBatchReadPolicy, ['authenticated'])
    || !/stackr_gate0_user_has_premium_seller/.test(sellerBatchReadPolicy.qual ?? '')
    || /auth\.jwt|user_metadata/.test(sellerBatchReadPolicy.qual ?? '')) {
    errors.push('gate0_seller_batch_read_entitlement_policy_missing');
  }

  const tablePrivileges = mapBy(
    snapshot.tablePrivileges,
    (row) => `${row.table_name}.${row.role_name}.${row.privilege_name}`,
  );
  const forbiddenTables = [
    'trade_cash_terms',
    'trades',
    'trade_reviews',
    'trader_ratings',
    'family_purchase_requests',
    'trade_listings',
    'marketplace_listings',
  ];
  const privileges = [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER',
  ];
  for (const tableName of forbiddenTables) {
    for (const roleName of ['anon', 'authenticated', 'service_role']) {
      for (const privilege of privileges) {
        if (tablePrivileges.get(`${tableName}.${roleName}.${privilege}`)?.allowed !== false) {
          errors.push(`gate0_forbidden_table_privilege:${tableName}:${roleName}:${privilege}`);
        }
      }
    }
  }
  const expectedAuthenticatedPrivileges = new Map([
    ['trade_offers', new Set(['SELECT'])],
    ['trade_offer_cards', new Set(['SELECT', 'INSERT'])],
    ['trade_offer_events', new Set(['SELECT', 'INSERT'])],
  ]);
  for (const [tableName, allowedPrivileges] of expectedAuthenticatedPrivileges) {
    for (const privilege of privileges) {
      const allowed = tablePrivileges.get(
        `${tableName}.authenticated.${privilege}`,
      )?.allowed;
      if (allowed !== allowedPrivileges.has(privilege)) {
        errors.push(`gate0_card_trade_privilege_drift:${tableName}:${privilege}`);
      }
      if (tablePrivileges.get(`${tableName}.anon.${privilege}`)?.allowed !== false) {
        errors.push(`gate0_anon_trade_privilege:${tableName}:${privilege}`);
      }
    }
  }

  for (const privilege of privileges) {
    const serviceAllowed = tablePrivileges.get(
      `trade_offers.service_role.${privilege}`,
    )?.allowed;
    if (serviceAllowed !== (privilege === 'SELECT')) {
      errors.push(`gate0_trade_offer_service_table_privilege:${privilege}`);
    }
    const eventServiceAllowed = tablePrivileges.get(
      `trade_offer_events.service_role.${privilege}`,
    )?.allowed;
    if (eventServiceAllowed !== ['SELECT', 'INSERT'].includes(privilege)) {
      errors.push(`gate0_trade_event_service_privilege:${privilege}`);
    }
    const cardServiceAllowed = tablePrivileges.get(
      `trade_offer_cards.service_role.${privilege}`,
    )?.allowed;
    if (cardServiceAllowed !== ['SELECT', 'INSERT'].includes(privilege)) {
      errors.push(`gate0_trade_card_service_privilege:${privilege}`);
    }
  }

  const sellerTables = [
    'seller_inventory_items',
    'inventory_movements',
    'seller_sale_transactions',
    'seller_sale_transaction_items',
  ];
  const sellerDml = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
  for (const tableName of sellerTables) {
    for (const privilege of privileges) {
      for (const roleName of ['authenticated', 'service_role']) {
        const allowed = tablePrivileges.get(
          `${tableName}.${roleName}.${privilege}`,
        )?.allowed;
        const expected = roleName === 'authenticated'
          ? privilege === 'SELECT'
          : sellerDml.has(privilege);
        if (allowed !== expected) {
          errors.push(`gate0_seller_privilege_drift:${tableName}:${roleName}:${privilege}`);
        }
      }
      if (tablePrivileges.get(`${tableName}.anon.${privilege}`)?.allowed !== false) {
        errors.push(`gate0_anon_seller_privilege:${tableName}:${privilege}`);
      }
    }
  }

  const sequencePrivileges = mapBy(
    snapshot.sequencePrivileges,
    (row) => `${row.role_name}.${row.privilege_name}`,
  );
  for (const roleName of ['authenticated', 'service_role']) {
    for (const privilege of ['USAGE', 'SELECT', 'UPDATE']) {
      const expected = roleName === 'service_role' && privilege !== 'UPDATE';
      if (sequencePrivileges.get(`${roleName}.${privilege}`)?.allowed !== expected) {
        errors.push(`gate0_seller_sequence_privilege_drift:${roleName}:${privilege}`);
      }
    }
  }
  for (const privilege of ['USAGE', 'SELECT', 'UPDATE']) {
    if (sequencePrivileges.get(`anon.${privilege}`)?.allowed !== false) {
      errors.push(`gate0_anon_seller_sequence_privilege:${privilege}`);
    }
  }

  const sellerReceiptPrivileges = mapBy(
    snapshot.sellerReceiptPrivileges,
    (row) => `${row.role_name}.${row.privilege_name}`,
  );
  for (const roleName of ['anon', 'authenticated', 'service_role']) {
    for (const privilege of privileges) {
      const expected = roleName === 'authenticated'
        ? privilege === 'SELECT'
        : roleName === 'service_role' && sellerDml.has(privilege);
      if (sellerReceiptPrivileges.get(`${roleName}.${privilege}`)?.allowed !== expected) {
        errors.push(`gate0_seller_receipt_privilege_drift:${roleName}:${privilege}`);
      }
    }
  }

  for (const privilege of snapshot.columnPrivileges) {
    if (privilege.allowed !== false) {
      errors.push(
        `gate0_financial_column_privilege:${privilege.table_name}:${privilege.column_name}:${privilege.role_name}:${privilege.privilege_name}`,
      );
    }
  }
  errors.push(...verifyAuthenticatedProfileAclMatrix(
    snapshot.authenticatedProfileColumnPrivileges,
  ));
  for (const privilege of snapshot.safeTradeOfferColumnPrivileges) {
    if (privilege.allowed !== true) {
      errors.push(
        `gate0_safe_trade_offer_column_missing:${privilege.role_name}:${privilege.column_name}:${privilege.privilege_name}`,
      );
    }
  }

  for (const functionContract of snapshot.functions) {
    if (functionContract.function_kind === 'entitlement_helper') {
      if (!functionContract.present
        || !functionContract.public_cannot_execute
        || functionContract.anon_cannot_execute
        || functionContract.authenticated_cannot_execute
        || functionContract.service_role_cannot_execute
        || !functionContract.security_definer
        || !functionContract.empty_search_path
        || functionContract.owner_role !== 'postgres'
        || !/auth\.users/.test(functionContract.definition)
        || !/raw_app_meta_data/.test(functionContract.definition)
        || !/stackr_premium_seller/.test(functionContract.definition)
        || /raw_user_meta_data|user_metadata/.test(functionContract.definition)) {
        errors.push(`gate0_current_entitlement_helper_missing:${functionContract.signature}`);
      }
      continue;
    }

    if (functionContract.function_kind === 'dispute_helper') {
      if (!functionContract.present
        || !functionContract.public_cannot_execute
        || !functionContract.anon_cannot_execute
        || functionContract.authenticated_cannot_execute
        || !functionContract.service_role_cannot_execute
        || !functionContract.security_definer
        || !functionContract.empty_search_path
        || functionContract.owner_role !== 'postgres'
        || !/sender_card\.offer_id = offer\.id/.test(functionContract.definition)
        || !/sender_card\.owner_id = offer\.sender_id/.test(functionContract.definition)
        || !/requested_card\.offer_id = offer\.id/.test(functionContract.definition)
        || !/requested_card\.owner_id = offer\.receiver_id/.test(functionContract.definition)
        || !/requested_card\.card_id = listing\.card_id/.test(functionContract.definition)
        || !/requested_card\.set_id is not distinct from listing\.set_id/.test(
          functionContract.definition
        )
        || !/select count/.test(functionContract.definition)
        || !/invalid_card\.offer_id = offer\.id/.test(functionContract.definition)
        || !/trade_cash_terms/.test(functionContract.definition)) {
        errors.push(`gate0_card_trade_dispute_helper_missing:${functionContract.signature}`);
      }
      continue;
    }

    if (functionContract.function_kind === 'conditional_rpc') {
      if (!functionContract.present
        || !functionContract.public_cannot_execute
        || !functionContract.anon_cannot_execute
        || functionContract.authenticated_cannot_execute
        || !functionContract.service_role_cannot_execute
        || !functionContract.security_definer
        || !functionContract.empty_search_path
        || functionContract.owner_role !== 'postgres'
        || !/stackr_gate0_user_has_premium_seller/.test(functionContract.definition)) {
        errors.push(`gate0_conditional_function_boundary_missing:${functionContract.signature}`);
      }
      continue;
    }

    if (functionContract.function_kind === 'conditional_rpc_delegate') {
      if (!functionContract.present
        || !functionContract.public_cannot_execute
        || !functionContract.anon_cannot_execute
        || !functionContract.authenticated_cannot_execute
        || !functionContract.service_role_cannot_execute
        || !functionContract.empty_search_path
        || functionContract.owner_role !== 'postgres') {
        errors.push(`gate0_conditional_delegate_boundary_missing:${functionContract.signature}`);
      }
      continue;
    }

    if (!functionContract.present
      || !functionContract.public_cannot_execute
      || !functionContract.anon_cannot_execute
      || !functionContract.authenticated_cannot_execute
      || !functionContract.service_role_cannot_execute) {
      errors.push(`gate0_function_boundary_missing:${functionContract.signature}`);
      continue;
    }
    if (functionContract.function_kind === 'guard'
      && (!functionContract.security_invoker || !functionContract.empty_search_path)) {
      errors.push(`gate0_guard_function_security_drift:${functionContract.signature}`);
    }
    if (functionContract.signature
      === 'public.stackr_gate0_guard_trade_offer_card_membership()'
      && (
        !/auth\.uid/.test(functionContract.definition)
        || !/user_card_flags/.test(functionContract.definition)
        || !/user_card_variants/.test(functionContract.definition)
        || !/quantity > 0/.test(functionContract.definition)
        || !/new\.card_id is distinct from listing_card_id/.test(
          functionContract.definition
        )
        || !/new\.set_id is distinct from listing_set_id/.test(
          functionContract.definition
        )
        || !/owned_variant\.user_id = offer_sender_id/.test(functionContract.definition)
        || !/owned_variant\.card_id = new\.card_id/.test(functionContract.definition)
        || !/owned_variant\.set_id = new\.set_id/.test(functionContract.definition)
        || !/existing_requested_card\.offer_id = new\.offer_id/.test(
          functionContract.definition
        )
        || !/user_card_flags[\s\S]+for share/.test(functionContract.definition)
        || !/user_card_variants[\s\S]+quantity > 0[\s\S]+for update/.test(
          functionContract.definition
        )
        || !/for update/.test(functionContract.definition)
      )) {
      errors.push('gate0_offer_card_membership_definition_drift');
    }
    if (functionContract.signature
      === 'public.stackr_gate0_guard_listing_financial_state()'
      && (
        !/trade_offers/.test(functionContract.definition)
        || !/card_id is distinct from/.test(functionContract.definition)
        || !/set_id is distinct from/.test(functionContract.definition)
        || !/trade listing identity disabled/.test(functionContract.definition)
        || !/referenced listing delete disabled/.test(functionContract.definition)
      )) {
      errors.push('gate0_referenced_listing_identity_guard_drift');
    }
  }

  if (snapshot.unsafeDefaultPrivilegeCount !== 0) {
    errors.push('gate0_unsafe_default_privileges');
  }

  return errors;
}

async function expectRejected(client, label, query, parameters, expectedCodes, errors) {
  const savepoint = `gate0_probe_${randomUUID().replaceAll('-', '')}`;
  await client.query(`savepoint ${savepoint}`);
  let rejected = false;
  try {
    await client.query(query, parameters);
  } catch (error) {
    rejected = true;
    const errorCode = safeErrorCode(error);
    if (!expectedCodes.includes(errorCode)) {
      errors.push(`gate0_probe_unexpected_error:${label}:${errorCode}`);
    }
  } finally {
    await client.query(`rollback to savepoint ${savepoint}`);
    await client.query(`release savepoint ${savepoint}`);
  }
  if (!rejected) errors.push(`gate0_probe_write_not_rejected:${label}`);
}

async function verifySaleItemSequenceNotConsumed(client, outerTransaction, errors) {
  const savepoint = 'gate0_probe_sequence_currval';
  if (outerTransaction) await client.query(`savepoint ${savepoint}`);
  let untouched = false;
  try {
    await client.query(
      "select pg_catalog.currval('public.seller_sale_transaction_items_id_seq')",
    );
  } catch (error) {
    const errorCode = safeErrorCode(error);
    if (errorCode === '55000') untouched = true;
    else errors.push(`gate0_probe_sequence_attestation_failed:${errorCode}`);
  } finally {
    if (outerTransaction) {
      try {
        await client.query(`rollback to savepoint ${savepoint}`);
        await client.query(`release savepoint ${savepoint}`);
      } catch (error) {
        errors.push(`gate0_probe_sequence_cleanup_failed:${safeErrorCode(error)}`);
      }
    }
  }
  if (!untouched) errors.push('gate0_probe_sale_item_sequence_consumed');
}

export async function runRollbackOnlyWriteProbe(
  client,
  { outerTransaction = false } = {},
) {
  const errors = [];
  const sessionBefore = await client.query(`
    select
      current_user::text as "currentUser",
      current_setting('request.jwt.claims', true) as request_jwt_claims
  `);
  const sender = await client.query(`
    select users.id, users.raw_app_meta_data
    from auth.users as users
    join public.profiles as profile on profile.id = users.id
    where not exists (
      select 1
      from public.seller_inventory_items as inventory
      where inventory.user_id = users.id
    )
      and not coalesce(
        users.raw_app_meta_data -> 'stackr_premium_seller' = 'true'::jsonb,
        false
      )
    order by users.created_at nulls last, users.id
    limit 1
  `);
  if (sender.rows.length !== 1) {
    return ['gate0_probe_requires_profiled_user_without_seller_inventory'];
  }
  const senderId = sender.rows[0].id;
  const senderRawAppMetadata = sender.rows[0].raw_app_meta_data;
  const receiver = await client.query(`
    select users.id, users.raw_app_meta_data
    from auth.users as users
    join public.profiles as profile on profile.id = users.id
    where users.id <> $1::uuid
    order by users.created_at nulls last, users.id
    limit 1
  `, [senderId]);
  if (receiver.rows.length !== 1) return ['gate0_probe_requires_two_profiled_users'];

  const catalogCard = await client.query(`
    select card.id, card.set_id
    from public.pokemon_cards as card
    where card.set_id is not null
      and not exists (
      select 1
      from public.user_card_flags as existing_flag
      where existing_flag.user_id in ($1::uuid, $2::uuid)
        and existing_flag.card_id = card.id
    )
      and not exists (
        select 1
        from public.user_card_variants as owned_variant
        where owned_variant.user_id = $1::uuid
          and owned_variant.card_id = card.id
      )
    order by card.id
    limit 3
  `, [senderId, receiver.rows[0].id]);
  if (catalogCard.rows.length !== 3) return ['gate0_probe_requires_three_catalog_cards'];

  const receiverId = receiver.rows[0].id;
  const receiverRawAppMetadata = receiver.rows[0].raw_app_meta_data;
  const sellerInventoryId = `gate0-inventory-${randomUUID()}`;
  const sellerMovementId = `gate0-movement-${randomUUID()}`;
  const senderOwnedVariantId = randomUUID();
  const sellerCardId = catalogCard.rows[0].id;
  const sellerSetId = catalogCard.rows[0].set_id;
  const wishlistCardId = catalogCard.rows[1].id;
  const wishlistSetId = catalogCard.rows[1].set_id;
  const listingCardId = catalogCard.rows[2].id;
  const listingSetId = catalogCard.rows[2].set_id;
  const wrongSetId = `gate0-wrong-set-${randomUUID()}`;
  const sellerTimestamp = new Date().toISOString();
  const sellerInventory = [{
    id: sellerInventoryId,
    card_id: sellerCardId,
    set_id: null,
    condition: 'Near Mint',
    quantity: 1,
    asking_price: null,
    buy_price: null,
    notes: 'Gate 0 rollback-only verification',
    card: {},
    created_at: sellerTimestamp,
    updated_at: sellerTimestamp,
  }];
  const sellerMovements = [{
    id: sellerMovementId,
    inventory_item_id: sellerInventoryId,
    action_type: 'scan_in',
    card_id: sellerCardId,
    set_id: null,
    card_name: 'Gate 0 rollback-only card',
    quantity: 1,
    reason: 'Gate 0 rollback-only verification',
    binder_id: null,
    binder_name: null,
    collection_id: null,
    value_at_time: 0,
    image_small: null,
    created_at: sellerTimestamp,
  }];
  const sellerRequestId = `seller-batch:${senderId}:gate0-${randomUUID()}`;
  const sellerNoopRequestId = `seller-batch:${senderId}:gate0-noop-${randomUUID()}`;
  const outerSavepoint = 'gate0_full_write_probe';
  let offerId = null;
  let emptyOfferId = null;
  let cardIdentityProbeOfferId = null;
  let listingId = null;
  let entitledListingId = null;
  const receiverListingId = randomUUID();
  const inactiveReceiverListingId = randomUUID();
  let sellerSaleId = null;
  let sellerSaleItemId = null;
  let rejectedSellerSaleItemId = null;
  let saleItemSequenceBefore = null;
  let transactionStarted = false;
  await client.query(outerTransaction ? `savepoint ${outerSavepoint}` : 'begin');
  transactionStarted = true;
  try {
    const sequenceBefore = await client.query(`
      select last_value::text as last_value, is_called
      from public.seller_sale_transaction_items_id_seq
    `);
    if (sequenceBefore.rowCount !== 1 || sequenceBefore.rows.length !== 1) {
      errors.push('gate0_probe_sequence_snapshot_row_count_invalid');
      throw new Error('gate0_probe_sequence_snapshot_row_count_invalid');
    }
    saleItemSequenceBefore = sequenceBefore.rows[0];

    // Identity sequences are nontransactional. Serialize verifier allocations
    // and use explicit negative IDs so even rejected/rolled-back probes never
    // advance the live seller sale-item sequence.
    await client.query(`
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'stackr_gate0_seller_sale_item_probe_ids',
          0
        )
      )
    `);
    const saleItemIds = await client.query(`
      select
        (least(coalesce(min(sale_item.id), 0), 0) - 1)::text as first_id,
        (least(coalesce(min(sale_item.id), 0), 0) - 2)::text as second_id
      from public.seller_sale_transaction_items as sale_item
    `);
    sellerSaleItemId = saleItemIds.rows[0]?.first_id ?? null;
    rejectedSellerSaleItemId = saleItemIds.rows[0]?.second_id ?? null;
    if (!sellerSaleItemId || !rejectedSellerSaleItemId) {
      errors.push('gate0_probe_sale_item_id_allocation_failed');
      throw new Error('gate0_probe_sale_item_id_allocation_failed');
    }

    await client.query(`
      update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || '{"stackr_premium_seller":true}'::jsonb
      where id = $1::uuid
    `, [receiverId]);
    await client.query(`
      insert into public.user_card_flags (
        id, user_id, card_id, set_id, flag_type, listing_status
      ) values
        ($1, $3, $4, $5, 'trade', null),
        ($2, $3, $6, $7, 'trade', 'archived')
    `, [
      receiverListingId,
      inactiveReceiverListingId,
      receiverId,
      listingCardId,
      listingSetId,
      wishlistCardId,
      wishlistSetId,
    ]);
    await client.query(`
      insert into public.user_card_variants (
        id, user_id, card_id, set_id, variant, quantity
      ) values ($1, $2, $3, $4, 'normal', 1)
    `, [senderOwnedVariantId, senderId, sellerCardId, sellerSetId]);

    await client.query('set local role authenticated');
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: senderId, role: 'authenticated' })],
    );
    const identity = await client.query('select auth.uid() = $1::uuid as matches', [senderId]);
    if (identity.rows[0]?.matches !== true) {
      errors.push('gate0_probe_authenticated_identity_failed');
      throw new Error('gate0_probe_authenticated_identity_failed');
    }

    const offer = await client.query(`
      insert into public.trade_offers (
        listing_id, sender_id, receiver_id, status, message
      ) values ($1, $2, $3, 'pending', 'Gate 0 rollback-only verification')
      returning id
    `, [receiverListingId, senderId, receiverId]);
    offerId = offer.rows[0].id;

    for (const [label, candidateListingId, candidateReceiverId] of [
      ['client_null_listing_offer', null, receiverId],
      ['client_missing_listing_offer', randomUUID(), receiverId],
      ['client_inactive_listing_offer', inactiveReceiverListingId, receiverId],
      ['client_self_trade_offer', receiverListingId, senderId],
      ['client_arbitrary_receiver_offer', receiverListingId, randomUUID()],
    ]) {
      await expectRejected(
        client,
        label,
        `insert into public.trade_offers (
          listing_id, sender_id, receiver_id, status
        ) values ($1, $2, $3, 'pending')`,
        [candidateListingId, senderId, candidateReceiverId],
        ['42501', '23514'],
        errors,
      );
    }

    for (const [label, ownerId, cardId, setId] of [
      [
        'client_requested_card_listing_mismatch',
        receiverId,
        wishlistCardId,
        listingSetId,
      ],
      [
        'client_requested_card_set_mismatch',
        receiverId,
        listingCardId,
        wrongSetId,
      ],
      [
        'client_unowned_sender_card',
        senderId,
        wishlistCardId,
        sellerSetId,
      ],
      [
        'client_owned_sender_card_set_mismatch',
        senderId,
        sellerCardId,
        wrongSetId,
      ],
    ]) {
      await expectRejected(
        client,
        label,
        `insert into public.trade_offer_cards (
          offer_id, owner_id, card_id, set_id
        ) values ($1, $2, $3, $4)`,
        [offerId, ownerId, cardId, setId],
        ['42501'],
        errors,
      );
    }

    await client.query(`
      insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id, notes
      )
      values
        ($1, $2, $4, $5, 'rollback-only'),
        ($1, $3, $6, $7, 'rollback-only')
    `, [
      offerId,
      senderId,
      receiverId,
      sellerCardId,
      sellerSetId,
      listingCardId,
      listingSetId,
    ]);
    await expectRejected(
      client,
      'client_duplicate_requested_listing_card',
      `insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id
      ) values ($1, $2, $3, $4)`,
      [offerId, receiverId, listingCardId, listingSetId],
      ['42501'],
      errors,
    );
    const cardIdentityProbeOffer = await client.query(`
      insert into public.trade_offers (
        listing_id, sender_id, receiver_id, status, message
      ) values (
        $1, $2, $3, 'pending', 'Gate 0 card-identity bypass probe'
      )
      returning id
    `, [receiverListingId, senderId, receiverId]);
    cardIdentityProbeOfferId = cardIdentityProbeOffer.rows[0].id;
    await client.query(`
      insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id, notes
      ) values ($1, $2, $3, $4, 'Gate 0 identity-probe sender card')
    `, [cardIdentityProbeOfferId, senderId, sellerCardId, sellerSetId]);
    await client.query(`
      insert into public.trade_offer_events (offer_id, user_id, event_type, note)
      values ($1, $2, 'offer_created', 'Gate 0 rollback-only verification')
    `, [offerId, senderId]);
    await client.query(`
      update public.trade_offers
      set status = 'accepted', accepted_at = now()
      where id = $1
    `, [offerId]);
    await client.query(`
      insert into public.trade_offer_events (offer_id, user_id, event_type, note)
      values ($1, $2, 'accepted', 'Gate 0 safe negotiation verification')
    `, [offerId, senderId]);
    await client.query(`
      update public.trade_offers
      set status = 'disputed'
      where id = $1
    `, [offerId]);
    await client.query(`
      insert into public.trade_offer_events (offer_id, user_id, event_type, note)
      values ($1, $2, 'disputed', 'Gate 0 card-trade safety verification')
    `, [offerId, senderId]);
    await client.query(`
      update public.trade_offers set status = 'cancelled' where id = $1
    `, [offerId]);
    await client.query(`
      insert into public.trade_offer_events (offer_id, user_id, event_type, note)
      values ($1, $2, 'cancelled', 'Gate 0 safe negotiation verification')
    `, [offerId, senderId]);

    const emptyOffer = await client.query(`
      insert into public.trade_offers (
        listing_id, sender_id, receiver_id, status, message
      ) values ($1, $2, $3, 'pending', 'Gate 0 empty-offer dispute rejection')
      returning id
    `, [receiverListingId, senderId, receiverId]);
    emptyOfferId = emptyOffer.rows[0].id;
    await expectRejected(
      client,
      'client_empty_offer_disputed_status',
      "update public.trade_offers set status = 'disputed' where id = $1",
      [emptyOfferId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_empty_offer_disputed_event',
      `insert into public.trade_offer_events (
        offer_id, user_id, event_type
      ) values ($1, $2, 'disputed')`,
      [emptyOfferId, senderId],
      ['42501'],
      errors,
    );
    await client.query(`
      insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id, notes
      ) values (
        $1, $2, $3, $4, 'Gate 0 partial-card dispute verification'
      )
    `, [emptyOfferId, senderId, sellerCardId, sellerSetId]);
    await expectRejected(
      client,
      'client_partial_offer_disputed_status',
      "update public.trade_offers set status = 'disputed' where id = $1",
      [emptyOfferId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_partial_offer_disputed_event',
      `insert into public.trade_offer_events (
        offer_id, user_id, event_type
      ) values ($1, $2, 'disputed')`,
      [emptyOfferId, senderId],
      ['42501'],
      errors,
    );
    await client.query(`
      insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id, notes
      ) values (
        $1, $2, $3, $4, 'Gate 0 complete-card dispute verification'
      )
    `, [emptyOfferId, receiverId, listingCardId, listingSetId]);
    await client.query(`
      update public.trade_offers
      set status = 'disputed'
      where id = $1
    `, [emptyOfferId]);
    await client.query('reset role');
    await client.query(`
      update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        - 'stackr_premium_seller'
      where id = $1::uuid
    `, [receiverId]);
    await client.query('set local role authenticated');
    await expectRejected(
      client,
      'client_revoked_listing_owner_offer',
      `insert into public.trade_offers (
        listing_id, sender_id, receiver_id, status
      ) values ($1, $2, $3, 'pending')`,
      [receiverListingId, senderId, receiverId],
      ['42501'],
      errors,
    );

    const listing = await client.query(`
      insert into public.user_card_flags (user_id, card_id, flag_type)
      values ($1, $2, 'wishlist')
      returning id
    `, [senderId, wishlistCardId]);
    listingId = listing.rows[0].id;

    await expectRejected(
      client,
      'client_unentitled_active_listing',
      `insert into public.user_card_flags (
        user_id, card_id, flag_type, listing_status
      ) values ($1, $2, 'trade', 'active')`,
      [senderId, listingCardId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_unentitled_seller_inventory',
      `insert into public.seller_inventory_items (
        id, user_id, card_id, condition, quantity, card_snapshot
      ) values ($1, $2, $3, 'Near Mint', 1, '{}'::jsonb)`,
      [`gate0-direct-inventory-${randomUUID()}`, senderId, sellerCardId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_unentitled_seller_sale',
      `insert into public.seller_sale_transactions (
        id, user_id, estimated_value
      ) values ($1, $2, 0)`,
      [`gate0-direct-sale-${randomUUID()}`, senderId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_unentitled_seller_batch_rpc',
      `select public.commit_seller_inventory_batch(
        $1::text,
        '[]'::jsonb,
        $2::jsonb,
        $3::jsonb,
        null::jsonb,
        '[]'::jsonb
      )`,
      [sellerRequestId, JSON.stringify(sellerInventory), JSON.stringify(sellerMovements)],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_unentitled_seller_batch_noop_rpc',
      `select public.commit_seller_inventory_batch(
        $1::text,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        null::jsonb,
        '[]'::jsonb
      )`,
      [sellerNoopRequestId],
      ['42501'],
      errors,
    );
    await client.query('reset role');
    await client.query(`
      update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || '{"stackr_premium_seller":true}'::jsonb
      where id = $1::uuid
    `, [senderId]);
    await client.query('set local role authenticated');
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({
        sub: senderId,
        role: 'authenticated',
        app_metadata: { stackr_premium_seller: true },
      })],
    );
    const entitledListing = await client.query(`
      insert into public.user_card_flags (
        user_id, card_id, flag_type, listing_status
      ) values ($1, $2, 'trade', 'active')
      returning id
    `, [senderId, listingCardId]);
    entitledListingId = entitledListing.rows[0].id;
    const sellerBatch = await client.query(`
      select public.commit_seller_inventory_batch(
        $1::text,
        '[]'::jsonb,
        $2::jsonb,
        $3::jsonb,
        null::jsonb,
        '[]'::jsonb
      ) as result
    `, [sellerRequestId, JSON.stringify(sellerInventory), JSON.stringify(sellerMovements)]);
    if (sellerBatch.rows[0]?.result?.inventoryItemCount !== 1
      || sellerBatch.rows[0]?.result?.movementCount !== 1
      || sellerBatch.rows[0]?.result?.saleRecorded !== false) {
      errors.push('gate0_probe_entitled_seller_batch_result_invalid');
    }
    sellerSaleId = `gate0-sale-${randomUUID()}`;
    await expectRejected(
      client,
      'client_entitled_direct_seller_write',
      `insert into public.seller_sale_transactions (
        id, user_id, estimated_value
      ) values ($1, $2, 0)`,
      [sellerSaleId, senderId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_entitled_direct_seller_receipt',
      `insert into private.seller_inventory_batch_commits (
        user_id, request_id, payload, result
      ) values ($1, $2, '{}'::jsonb, '{}'::jsonb)`,
      [senderId, sellerNoopRequestId],
      ['42501'],
      errors,
    );
    await client.query('reset role');
    await client.query(`
      insert into public.seller_sale_transactions (
        id, user_id, estimated_value
      ) values ($1, $2, 0)
    `, [sellerSaleId, senderId]);
    await client.query(`
      insert into public.seller_sale_transaction_items (
        id,
        transaction_id,
        user_id,
        inventory_item_id,
        card_id,
        card_name,
        condition,
        quantity
      ) values ($1, $2, $3, $4, $5, 'Gate 0 rollback-only card', 'Near Mint', 1)
    `, [sellerSaleItemId, sellerSaleId, senderId, sellerInventoryId, sellerCardId]);

    // Revoke the database entitlement while deliberately retaining a stale
    // JWT claim. Current auth.users state must immediately hide/freeze the
    // listing and reject every seller mutation path.
    await client.query(`
      update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        - 'stackr_premium_seller'
      where id = $1::uuid
    `, [senderId]);
    await client.query('set local role authenticated');
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({
        sub: receiverId,
        role: 'authenticated',
        app_metadata: { stackr_premium_seller: true },
      })],
    );
    const revokedListingOtherView = await client.query(`
      select count(*)::int as count
      from public.user_card_flags
      where id = $1
    `, [entitledListingId]);
    if (Number(revokedListingOtherView.rows[0]?.count) !== 0) {
      errors.push('gate0_probe_revoked_listing_visible_to_other_user');
    }
    await client.query('set local role anon');
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ role: 'anon' })],
    );
    const revokedListingAnonView = await client.query(`
      select count(*)::int as count
      from public.user_card_flags
      where id = $1
    `, [entitledListingId]);
    if (Number(revokedListingAnonView.rows[0]?.count) !== 0) {
      errors.push('gate0_probe_revoked_listing_visible_to_anon');
    }
    await client.query('set local role authenticated');
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({
        sub: senderId,
        role: 'authenticated',
        app_metadata: { stackr_premium_seller: true },
      })],
    );
    const revokedListingOwnerView = await client.query(`
      select count(*)::int as count
      from public.user_card_flags
      where id = $1
    `, [entitledListingId]);
    if (Number(revokedListingOwnerView.rows[0]?.count) !== 1) {
      errors.push('gate0_probe_revoked_listing_not_visible_to_owner');
    }
    await expectRejected(
      client,
      'client_stale_jwt_active_listing_mutation',
      `update public.user_card_flags
       set updated_at = now()
       where id = $1`,
      [entitledListingId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_stale_jwt_seller_inventory',
      `insert into public.seller_inventory_items (
        id, user_id, card_id, condition, quantity, card_snapshot
      ) values ($1, $2, $3, 'Near Mint', 1, '{}'::jsonb)`,
      [`gate0-revoked-inventory-${randomUUID()}`, senderId, sellerCardId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_stale_jwt_inventory_movement',
      `insert into public.inventory_movements (
        id, user_id, inventory_item_id, action_type, card_id, quantity, reason
      ) values ($1, $2, $3, 'scan_in', $4, 1, 'Gate 0 revoked probe')`,
      [`gate0-revoked-movement-${randomUUID()}`, senderId, sellerInventoryId, sellerCardId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_stale_jwt_seller_sale',
      `insert into public.seller_sale_transactions (
        id, user_id, estimated_value
      ) values ($1, $2, 0)`,
      [`gate0-revoked-sale-${randomUUID()}`, senderId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_stale_jwt_seller_sale_item',
      `insert into public.seller_sale_transaction_items (
        id, transaction_id, user_id, inventory_item_id, card_id,
        card_name, condition, quantity
      ) values ($1, $2, $3, $4, $5, 'Gate 0 revoked card', 'Near Mint', 1)`,
      [
        rejectedSellerSaleItemId,
        sellerSaleId,
        senderId,
        sellerInventoryId,
        sellerCardId,
      ],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_stale_jwt_seller_batch_replay_rpc',
      `select public.commit_seller_inventory_batch(
        $1::text,
        '[]'::jsonb,
        $2::jsonb,
        $3::jsonb,
        null::jsonb,
        '[]'::jsonb
      )`,
      [sellerRequestId, JSON.stringify(sellerInventory), JSON.stringify(sellerMovements)],
      ['42501'],
      errors,
    );
    const revokedBatchVisibility = await client.query(`
      select count(*)::int as count
      from private.seller_inventory_batch_commits
      where request_id = $1
        and user_id = $2::uuid
    `, [sellerRequestId, senderId]);
    if (Number(revokedBatchVisibility.rows[0]?.count) !== 0) {
      errors.push('gate0_probe_revoked_seller_batch_receipt_visible');
    }
    await expectRejected(
      client,
      'client_stale_jwt_seller_batch_noop_rpc',
      `select public.commit_seller_inventory_batch(
        $1::text,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        null::jsonb,
        '[]'::jsonb
      )`,
      [`seller-batch:${senderId}:gate0-revoked-${randomUUID()}`],
      ['42501'],
      errors,
    );
    const archivedListing = await client.query(`
      update public.user_card_flags
      set listing_status = 'archived'
      where id = $1
      returning id
    `, [entitledListingId]);
    if (archivedListing.rowCount !== 1) {
      errors.push('gate0_probe_owner_listing_archive_failed');
    }
    await expectRejected(
      client,
      'client_unentitled_listing_reactivation',
      `update public.user_card_flags
       set listing_status = 'active'
       where id = $1`,
      [entitledListingId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_sold_listing_state',
      `update public.user_card_flags
       set listing_status = 'sold'
       where id = $1`,
      [entitledListingId],
      ['P0001', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'client_hidden_trade_review',
      `insert into public.trade_reviews (
        trade_id, reviewer_id, reviewed_user_id, rating, comment
      ) values ($1, $2, $3, 5, 'Gate 0 hidden review probe')`,
      [offerId, senderId, receiverId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_hidden_trader_rating',
      `insert into public.trader_ratings (
        trade_offer_id, reviewer_id, reviewed_user_id, rating, review
      ) values ($1, $2, $3, 5, 'Gate 0 hidden rating probe')`,
      [offerId, senderId, receiverId],
      ['42501'],
      errors,
    );

    await expectRejected(
      client,
      'client_cash_terms',
      `insert into public.trade_cash_terms (
        offer_id, payer_id, recipient_id, amount
      ) values ($1, $2, $3, 1)`,
      [offerId, senderId, receiverId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_payment_status',
      "update public.trade_offers set status = 'payment_required' where id = $1",
      [offerId],
      ['P0001', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'client_null_trade_status',
      'update public.trade_offers set status = null where id = $1',
      [offerId],
      ['P0001', '23502', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'client_fulfilment_status',
      "update public.trade_offers set status = 'sent' where id = $1",
      [offerId],
      ['P0001', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'client_fulfilment_flag',
      'update public.trade_offers set sender_sent = true where id = $1',
      [offerId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_fulfilment_completed_at',
      'update public.trade_offers set completed_at = now() where id = $1',
      [offerId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_trade_participant_rewrite',
      'update public.trade_offers set sender_id = $2 where id = $1',
      [offerId, receiverId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_financial_event',
      `insert into public.trade_offer_events (
        offer_id, user_id, event_type, proposed_cash_amount
      ) values ($1, $2, 'counter_offer', 1)`,
      [offerId, senderId],
      ['P0001', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'client_fulfilment_event',
      `insert into public.trade_offer_events (
        offer_id, user_id, event_type
      ) values ($1, $2, 'sent')`,
      [offerId, senderId],
      ['P0001', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'client_fulfilment_proposed_status',
      `insert into public.trade_offer_events (
        offer_id, user_id, event_type, proposed_status
      ) values ($1, $2, 'counter_offer', 'received')`,
      [offerId, senderId],
      ['P0001', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'client_listing_payment_binding',
      "update public.user_card_flags set payment_intent_id = 'pi_gate0_probe' where id = $1",
      [listingId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_profile_stripe_binding',
      "update public.profiles set stripe_account_id = 'acct_gate0_probe' where id = $1",
      [senderId],
      ['42501'],
      errors,
    );
    for (const [label, query] of [
      [
        'client_profile_id_update',
        'update public.profiles as profile set id = profile.id where profile.id = $1',
      ],
      [
        'client_profile_email_update',
        'update public.profiles as profile set email = profile.email where profile.id = $1',
      ],
      [
        'client_profile_role_update',
        'update public.profiles as profile set role = profile.role where profile.id = $1',
      ],
    ]) {
      await expectRejected(client, label, query, [senderId], ['42501'], errors);
    }
    await expectRejected(
      client,
      'client_legacy_fulfilment',
      'insert into public.trades default values',
      [],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_family_purchase',
      'insert into public.family_purchase_requests default values',
      [],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_legacy_trade_listing',
      'insert into public.trade_listings default values',
      [],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'client_legacy_marketplace_listing',
      'insert into public.marketplace_listings default values',
      [],
      ['42501'],
      errors,
    );
    for (const [label, query, parameters] of [
      [
        'client_accept_trade_offer_rpc',
        'select public.accept_trade_offer($1::uuid)',
        [offerId],
      ],
      [
        'client_create_family_purchase_rpc',
        'select public.create_family_purchase_request($1::uuid, $2::uuid)',
        [senderId, listingId],
      ],
      [
        'client_respond_family_purchase_rpc',
        "select public.respond_family_purchase_request($1::uuid, 'declined')",
        [offerId],
      ],
    ]) {
      await expectRejected(client, label, query, parameters, ['42501'], errors);
    }

    // Exercise the service-role trigger layer behind the permanently revoked
    // review-table grants. This grant is transaction-local in effect because
    // the complete probe is rolled back (or rolled back to its outer savepoint).
    await client.query('reset role');
    await client.query(`
      grant insert, update, delete
      on table public.trade_reviews, public.trader_ratings
      to service_role
    `);
    await client.query(`
      grant update (listing_id) on table public.trade_offers to service_role;
      grant update, delete on table public.trade_offer_cards to service_role
    `);
    await client.query('set local role service_role');
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: senderId, role: 'service_role' })],
    );
    await expectRejected(
      client,
      'service_unbound_trade_offer_trigger',
      `insert into public.trade_offers (
        listing_id, sender_id, receiver_id, status
      ) values (null, $1, $2, 'pending')`,
      [senderId, receiverId],
      ['42501', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'service_trade_offer_binding_rewrite_trigger',
      'update public.trade_offers set listing_id = $2 where id = $1',
      [offerId, inactiveReceiverListingId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'service_requested_card_listing_mismatch_trigger',
      `insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id
      ) values ($1, $2, $3, $4)`,
      [cardIdentityProbeOfferId, receiverId, wishlistCardId, listingSetId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'service_requested_card_set_mismatch_trigger',
      `insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id
      ) values ($1, $2, $3, $4)`,
      [cardIdentityProbeOfferId, receiverId, listingCardId, wrongSetId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'service_duplicate_requested_card_trigger',
      `insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id
      ) values ($1, $2, $3, $4)`,
      [offerId, receiverId, listingCardId, listingSetId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'service_third_party_card_owner_trigger',
      `insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id
      ) values ($1, $2, $3, $4)`,
      [cardIdentityProbeOfferId, randomUUID(), listingCardId, listingSetId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'service_unowned_sender_card_trigger',
      `insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id
      ) values ($1, $2, $3, $4)`,
      [offerId, senderId, wishlistCardId, sellerSetId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'service_owned_sender_card_set_mismatch_trigger',
      `insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id
      ) values ($1, $2, $3, $4)`,
      [offerId, senderId, sellerCardId, wrongSetId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'service_referenced_listing_identity_rewrite_trigger',
      'update public.user_card_flags set card_id = $2 where id = $1',
      [receiverListingId, wishlistCardId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'service_referenced_listing_delete_trigger',
      'delete from public.user_card_flags where id = $1',
      [receiverListingId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'service_trade_offer_card_rewrite_trigger',
      `update public.trade_offer_cards
       set offer_id = $2
       where offer_id = $1 and owner_id = $3`,
      [offerId, emptyOfferId, senderId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'service_trade_offer_card_delete_trigger',
      `delete from public.trade_offer_cards
       where offer_id = $1 and owner_id = $2`,
      [offerId, senderId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'service_hidden_trade_review_trigger',
      `insert into public.trade_reviews (
        trade_id, reviewer_id, reviewed_user_id, rating
      ) values ($1, $2, $3, 5)`,
      [offerId, senderId, receiverId],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'service_hidden_trader_rating_trigger',
      `insert into public.trader_ratings (
        trade_offer_id, reviewer_id, reviewed_user_id, rating
      ) values ($1, $2, $3, 5)`,
      [offerId, senderId, receiverId],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'service_fulfilment_status_trigger',
      "update public.trade_offers set status = 'sent' where id = $1",
      [offerId],
      ['P0001', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'service_card_trade_dispute_forbidden',
      "update public.trade_offers set status = 'disputed' where id = $1",
      [offerId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'service_fulfilment_flag_privilege',
      'update public.trade_offers set sender_sent = true where id = $1',
      [offerId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'service_fulfilment_event_trigger',
      `insert into public.trade_offer_events (
        offer_id, user_id, event_type
      ) values ($1, $2, 'received')`,
      [offerId, senderId],
      ['P0001', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'service_sold_listing_trigger',
      `update public.user_card_flags
       set listing_status = 'sold'
       where id = $1`,
      [entitledListingId],
      ['P0001', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'service_unentitled_active_listing_trigger',
      `insert into public.user_card_flags (
        user_id, card_id, flag_type, listing_status
      ) values ($1, $2, 'trade', 'active')`,
      [senderId, listingCardId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'service_unentitled_seller_trigger',
      `insert into public.seller_sale_transactions (
        id, user_id, estimated_value
      ) values ($1, $2, 0)`,
      [`gate0-service-revoked-sale-${randomUUID()}`, senderId],
      ['42501'],
      errors,
    );
    for (const [label, query, parameters] of [
      [
        'service_revoked_seller_inventory_update',
        'update public.seller_inventory_items set notes = $2 where id = $1',
        [sellerInventoryId, 'Gate 0 rejected service update'],
      ],
      [
        'service_revoked_seller_inventory_delete',
        'delete from public.seller_inventory_items where id = $1',
        [sellerInventoryId],
      ],
      [
        'service_revoked_inventory_movement_update',
        'update public.inventory_movements set reason = $2 where id = $1',
        [sellerMovementId, 'Gate 0 rejected service update'],
      ],
      [
        'service_revoked_inventory_movement_delete',
        'delete from public.inventory_movements where id = $1',
        [sellerMovementId],
      ],
      [
        'service_revoked_seller_sale_update',
        'update public.seller_sale_transactions set estimated_value = 1 where id = $1',
        [sellerSaleId],
      ],
      [
        'service_revoked_seller_sale_delete',
        'delete from public.seller_sale_transactions where id = $1',
        [sellerSaleId],
      ],
      [
        'service_revoked_seller_sale_item_update',
        'update public.seller_sale_transaction_items set quantity = 2 where id = $1::bigint',
        [sellerSaleItemId],
      ],
      [
        'service_revoked_seller_sale_item_delete',
        'delete from public.seller_sale_transaction_items where id = $1::bigint',
        [sellerSaleItemId],
      ],
      [
        'service_revoked_seller_receipt_update',
        `update private.seller_inventory_batch_commits
         set result = result || '{"gate0_probe":true}'::jsonb
         where user_id = $1::uuid and request_id = $2::text`,
        [senderId, sellerRequestId],
      ],
      [
        'service_revoked_seller_receipt_delete',
        `delete from private.seller_inventory_batch_commits
         where user_id = $1::uuid and request_id = $2::text`,
        [senderId, sellerRequestId],
      ],
    ]) {
      await expectRejected(client, label, query, parameters, ['42501'], errors);
    }
    await expectRejected(
      client,
      'service_legacy_trade_listing_privilege',
      'insert into public.trade_listings default values',
      [],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'service_legacy_marketplace_listing_privilege',
      'insert into public.marketplace_listings default values',
      [],
      ['42501'],
      errors,
    );

    await client.query('reset role');
    await client.query(
      "select set_config('request.jwt.claims', '{}'::text, true)",
    );
    await expectRejected(
      client,
      'owner_unbound_trade_offer_trigger',
      `insert into public.trade_offers (
        listing_id, sender_id, receiver_id, status
      ) values (null, $1, $2, 'pending')`,
      [senderId, receiverId],
      ['42501', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'owner_trade_offer_binding_rewrite_trigger',
      'update public.trade_offers set listing_id = $2 where id = $1',
      [offerId, inactiveReceiverListingId],
      ['42501'],
      errors,
    );
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: senderId, role: 'authenticated' })],
    );
    await expectRejected(
      client,
      'owner_requested_card_listing_mismatch_trigger',
      `insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id
      ) values ($1, $2, $3, $4)`,
      [cardIdentityProbeOfferId, receiverId, wishlistCardId, listingSetId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'owner_requested_card_set_mismatch_trigger',
      `insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id
      ) values ($1, $2, $3, $4)`,
      [cardIdentityProbeOfferId, receiverId, listingCardId, wrongSetId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'owner_duplicate_requested_card_trigger',
      `insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id
      ) values ($1, $2, $3, $4)`,
      [offerId, receiverId, listingCardId, listingSetId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'owner_third_party_card_owner_trigger',
      `insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id
      ) values ($1, $2, $3, $4)`,
      [cardIdentityProbeOfferId, randomUUID(), listingCardId, listingSetId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'owner_unowned_sender_card_trigger',
      `insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id
      ) values ($1, $2, $3, $4)`,
      [offerId, senderId, wishlistCardId, sellerSetId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'owner_owned_sender_card_set_mismatch_trigger',
      `insert into public.trade_offer_cards (
        offer_id, owner_id, card_id, set_id
      ) values ($1, $2, $3, $4)`,
      [offerId, senderId, sellerCardId, wrongSetId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'owner_referenced_listing_identity_rewrite_trigger',
      'update public.user_card_flags set set_id = $2 where id = $1',
      [receiverListingId, wrongSetId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'owner_referenced_listing_delete_trigger',
      'delete from public.user_card_flags where id = $1',
      [receiverListingId],
      ['42501'],
      errors,
    );
    await client.query(
      "select set_config('request.jwt.claims', '{}'::text, true)",
    );
    await expectRejected(
      client,
      'owner_trade_review_trigger',
      `insert into public.trade_reviews (
        trade_id, reviewer_id, reviewed_user_id, rating
      ) values ($1, $2, $3, 5)`,
      [offerId, senderId, receiverId],
      ['P0001', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'owner_trader_rating_trigger',
      `insert into public.trader_ratings (
        trade_offer_id, reviewer_id, reviewed_user_id, rating
      ) values ($1, $2, $3, 5)`,
      [offerId, senderId, receiverId],
      ['P0001', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'owner_cash_trigger',
      `insert into public.trade_cash_terms (
        offer_id, payer_id, recipient_id, amount
      ) values ($1, $2, $3, 1)`,
      [offerId, senderId, receiverId],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'owner_payment_status_trigger',
      "update public.trade_offers set status = 'payment_required' where id = $1",
      [offerId],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'owner_fulfilment_status_trigger',
      "update public.trade_offers set status = 'completed' where id = $1",
      [offerId],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'owner_card_trade_dispute_without_actor',
      "update public.trade_offers set status = 'disputed' where id = $1",
      [offerId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'owner_fulfilment_flag_trigger',
      'update public.trade_offers set receiver_received = true where id = $1',
      [offerId],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'owner_null_fulfilment_flag_trigger',
      'update public.trade_offers set sender_sent = null where id = $1',
      [offerId],
      ['P0001', '23502', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'owner_fulfilment_completed_at_trigger',
      'update public.trade_offers set completed_at = now() where id = $1',
      [offerId],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'owner_financial_event_trigger',
      `insert into public.trade_offer_events (
        offer_id, user_id, event_type, proposed_cash_amount
      ) values ($1, $2, 'counter_offer', 1)`,
      [offerId, senderId],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'owner_fulfilment_event_trigger',
      `insert into public.trade_offer_events (
        offer_id, user_id, event_type
      ) values ($1, $2, 'completed')`,
      [offerId, senderId],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'owner_null_trade_event_trigger',
      `insert into public.trade_offer_events (
        offer_id, user_id, event_type
      ) values ($1, $2, null)`,
      [offerId, senderId],
      ['P0001', '23502', '23514'],
      errors,
    );
    await expectRejected(
      client,
      'owner_listing_payment_trigger',
      "update public.user_card_flags set payment_intent_id = 'pi_gate0_probe' where id = $1",
      [listingId],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'owner_sold_listing_trigger',
      `update public.user_card_flags
       set listing_status = 'sold'
       where id = $1`,
      [entitledListingId],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'owner_unentitled_active_listing_trigger',
      `insert into public.user_card_flags (
        user_id, card_id, flag_type, listing_status
      ) values ($1, $2, 'trade', 'active')`,
      [senderId, listingCardId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'owner_unentitled_seller_trigger',
      `insert into public.seller_sale_transactions (
        id, user_id, estimated_value
      ) values ($1, $2, 0)`,
      [`gate0-owner-revoked-sale-${randomUUID()}`, senderId],
      ['42501'],
      errors,
    );
    for (const [label, query, parameters] of [
      [
        'owner_revoked_seller_inventory_update',
        'update public.seller_inventory_items set notes = $2 where id = $1',
        [sellerInventoryId, 'Gate 0 rejected owner update'],
      ],
      [
        'owner_revoked_seller_inventory_delete',
        'delete from public.seller_inventory_items where id = $1',
        [sellerInventoryId],
      ],
      [
        'owner_revoked_inventory_movement_update',
        'update public.inventory_movements set reason = $2 where id = $1',
        [sellerMovementId, 'Gate 0 rejected owner update'],
      ],
      [
        'owner_revoked_inventory_movement_delete',
        'delete from public.inventory_movements where id = $1',
        [sellerMovementId],
      ],
      [
        'owner_revoked_seller_sale_update',
        'update public.seller_sale_transactions set estimated_value = 1 where id = $1',
        [sellerSaleId],
      ],
      [
        'owner_revoked_seller_sale_delete',
        'delete from public.seller_sale_transactions where id = $1',
        [sellerSaleId],
      ],
      [
        'owner_revoked_seller_sale_item_update',
        'update public.seller_sale_transaction_items set quantity = 2 where id = $1::bigint',
        [sellerSaleItemId],
      ],
      [
        'owner_revoked_seller_sale_item_delete',
        'delete from public.seller_sale_transaction_items where id = $1::bigint',
        [sellerSaleItemId],
      ],
      [
        'owner_revoked_seller_receipt_update',
        `update private.seller_inventory_batch_commits
         set result = result || '{"gate0_probe":true}'::jsonb
         where user_id = $1::uuid and request_id = $2::text`,
        [senderId, sellerRequestId],
      ],
      [
        'owner_revoked_seller_receipt_delete',
        `delete from private.seller_inventory_batch_commits
         where user_id = $1::uuid and request_id = $2::text`,
        [senderId, sellerRequestId],
      ],
    ]) {
      await expectRejected(client, label, query, parameters, ['42501'], errors);
    }
    await expectRejected(
      client,
      'owner_profile_stripe_trigger',
      "update public.profiles set stripe_account_id = 'acct_gate0_probe' where id = $1",
      [senderId],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'owner_legacy_fulfilment_trigger',
      'insert into public.trades default values',
      [],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'owner_family_purchase_trigger',
      'insert into public.family_purchase_requests default values',
      [],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'owner_legacy_trade_listing_trigger',
      'insert into public.trade_listings default values',
      [],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'owner_legacy_marketplace_listing_trigger',
      'insert into public.marketplace_listings default values',
      [],
      ['P0001'],
      errors,
    );
    await expectRejected(
      client,
      'third_party_card_owner',
      `insert into public.trade_offer_cards (offer_id, owner_id, card_id)
       values ($1, $2, 'gate0-verifier-third-party-card')`,
      [offerId, randomUUID()],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'owner_disputed_sole_card_offer_rewrite',
      `update public.trade_offer_cards
       set offer_id = $2
       where offer_id = $1`,
      [emptyOfferId, offerId],
      ['42501'],
      errors,
    );
    await expectRejected(
      client,
      'owner_disputed_sole_card_delete',
      'delete from public.trade_offer_cards where offer_id = $1',
      [emptyOfferId],
      ['42501'],
      errors,
    );
  } catch (error) {
    errors.push(`gate0_write_probe_failed:${safeErrorCode(error)}`);
  } finally {
    const cleanupStatements = outerTransaction
      ? [
        [`rollback to savepoint ${outerSavepoint}`, 'savepoint_rollback'],
        [`release savepoint ${outerSavepoint}`, 'savepoint_release'],
        ['reset role', 'role_reset'],
      ]
      : [
        ['rollback', 'transaction_rollback'],
        ['reset role', 'role_reset'],
      ];
    for (const [statement, label] of cleanupStatements) {
      try {
        await client.query(statement);
      } catch (error) {
        errors.push(`gate0_probe_cleanup_failed:${label}:${safeErrorCode(error)}`);
      }
    }
  }

  if (transactionStarted) {
    await verifySaleItemSequenceNotConsumed(client, outerTransaction, errors);
    try {
      const restoration = await client.query(`
        select
          current_user::text = $1::text as role_restored,
          current_setting('request.jwt.claims', true)
            is not distinct from $2::text as claims_restored,
          exists (
            select 1
            from auth.users as users
            where users.id = $3::uuid
              and users.raw_app_meta_data is not distinct from $4::jsonb
          ) as entitlement_restored,
          not exists (
            select 1
            from public.trade_offers as offer
            where offer.id = any($5::uuid[])
          ) as offers_removed,
          not exists (
            select 1
            from public.trade_offer_events as event
            where event.offer_id = any($5::uuid[])
          ) as events_removed,
          not exists (
            select 1
            from public.trade_offer_cards as offer_card
            where offer_card.offer_id = any($5::uuid[])
          ) as offer_cards_removed,
          not exists (
            select 1
            from public.user_card_variants as owned_variant
            where owned_variant.id = $16::uuid
          ) as sender_owned_variants_removed,
          not exists (
            select 1
            from public.user_card_flags as flag
            where flag.user_id = $3::uuid
              and flag.card_id::text = any($6::text[])
          ) as card_flags_removed,
          not exists (
            select 1
            from public.seller_inventory_items as inventory
            where inventory.id = any($7::text[])
          ) as seller_inventory_removed,
          not exists (
            select 1
            from public.inventory_movements as movement
            where movement.id = any($8::text[])
          ) as seller_movements_removed,
          not exists (
            select 1
            from public.seller_sale_transactions as sale
            where sale.id = any($9::text[])
          ) as seller_sales_removed,
          not exists (
            select 1
            from public.seller_sale_transaction_items as sale_item
            where sale_item.transaction_id = any($9::text[])
          ) as seller_sale_items_removed,
          not exists (
            select 1
            from private.seller_inventory_batch_commits as batch
            where batch.request_id = any($10::text[])
          ) as seller_batches_removed,
          exists (
            select 1
            from auth.users as users
            where users.id = $11::uuid
              and users.raw_app_meta_data is not distinct from $12::jsonb
          ) as receiver_entitlement_restored,
          not exists (
            select 1
            from public.user_card_flags as flag
            where flag.id = any($13::uuid[])
          ) as receiver_listings_removed,
          not exists (
            select 1
            from public.trade_reviews as review
            where review.trade_id = any($5::uuid[])
          ) as trade_reviews_removed,
          not exists (
            select 1
            from public.trader_ratings as rating
            where rating.trade_offer_id = any($5::uuid[])
          ) as trader_ratings_removed,
          exists (
            select 1
            from public.seller_sale_transaction_items_id_seq as sequence_state
            where sequence_state.last_value::text = $14::text
              and sequence_state.is_called is not distinct from $15::boolean
          ) as sale_item_sequence_unchanged
      `, [
        sessionBefore.rows[0].currentUser,
        sessionBefore.rows[0].request_jwt_claims,
        senderId,
        senderRawAppMetadata,
        [offerId, emptyOfferId, cardIdentityProbeOfferId].filter(Boolean),
        [wishlistCardId, listingCardId],
        [sellerInventoryId],
        [sellerMovementId],
        [sellerSaleId].filter(Boolean),
        [sellerRequestId, sellerNoopRequestId],
        receiverId,
        receiverRawAppMetadata,
        [receiverListingId, inactiveReceiverListingId],
        saleItemSequenceBefore?.last_value ?? null,
        saleItemSequenceBefore?.is_called ?? null,
        senderOwnedVariantId,
      ]);
      errors.push(...verifyProbeRestorationResult(restoration));
    } catch (error) {
      errors.push(`gate0_probe_restoration_query_failed:${safeErrorCode(error)}`);
    }
  }

  return errors;
}

async function main() {
if (process.env.SUPABASE_PROJECT_REF !== EXPECTED_PROJECT_REF) {
  result.errors.push('gate0_staging_project_ref_mismatch');
}
const dbUrl = process.env[dbUrlEnvironment];
if (!dbUrl) result.errors.push(`missing_gate0_database_url:${dbUrlEnvironment}`);

if (result.errors.length === 0) {
  const client = createVerifiedSupabasePostgresClient(
    dbUrl,
    `stackr-gate0-${phase}`,
    { statement_timeout: 30_000, query_timeout: 35_000 },
  );
  let connected = false;
  let readOnlyTransactionOpen = false;
  try {
    await client.connect();
    connected = true;
    await client.query('begin read only');
    readOnlyTransactionOpen = true;
    const counts = await readFinancialStateCounts(client);
    const snapshot = await readCatalogSnapshot(client);
    if (requiresPreApplySenderOwnershipBaseline(
      phase,
      snapshot.migrationApplied,
    )) {
      counts.invalid_sender_offer_cards_at_apply =
        await readPreApplySenderOfferCardOwnershipCount(client);
    }
    await client.query('rollback');
    readOnlyTransactionOpen = false;

    result.financialStateCounts = counts;
    const nonZeroCounts = findUnsafeFinancialStateCounts(counts, {
      allowUnentitledActiveListings: phase === 'pre-apply',
    });
    for (const name of nonZeroCounts) {
      result.errors.push(`gate0_staging_financial_state_not_zero:${name}`);
    }
    if (phase === 'pre-apply' && counts.unentitled_active_trade_listings > 0) {
      result.observations.push(
        `gate0_unentitled_active_listings_to_archive:${counts.unentitled_active_trade_listings}`,
      );
    }

    const catalogErrors = verifyCatalog(snapshot);
    const markerCount = Object.values(snapshot.markerInventory)
      .reduce((sum, count) => sum + count, 0);
    result.remoteState = snapshot.migrationApplied ? 'gate0-applied' : 'gate0-pending';
    result.catalog = {
      migrationApplied: snapshot.migrationApplied,
      markerCount,
      rlsEnabledCount: snapshot.rls.filter((entry) => entry.enabled).length,
      requiredRlsCount: 17,
      constraintCount: snapshot.markerInventory.constraint_markers,
      requiredConstraintCount: 14,
      triggerCount: snapshot.markerInventory.trigger_markers,
      requiredTriggerCount: 17,
      restrictivePolicyCount: snapshot.markerInventory.policy_markers,
      requiredRestrictivePolicyCount: 26,
      guardedFunctionCount: snapshot.functions
        .filter((entry) => entry.function_kind === 'guard' && entry.present).length,
      requiredGuardedFunctionCount: 8,
      helperFunctionCount: snapshot.functions
        .filter((entry) => (
          ['entitlement_helper', 'dispute_helper'].includes(entry.function_kind)
          && entry.present
        )).length,
      requiredHelperFunctionCount: 2,
      unsafeDefaultPrivilegeCount: snapshot.unsafeDefaultPrivilegeCount,
      globalFunctionDefaultContracts: snapshot.globalFunctionDefaultContracts,
      protectedFunctionCount: snapshot.protectedFunctionAcls.length,
      requiredProtectedFunctionCount: EXPECTED_PROTECTED_FUNCTION_COUNT,
      contractErrorCount: catalogErrors.length,
    };

    if (phase === 'pre-apply') {
      if (snapshot.migrationApplied) {
        result.errors.push(...catalogErrors);
      } else if (markerCount !== 0) {
        result.errors.push('gate0_partial_database_hardening_detected');
      } else {
        result.errors.push(...verifyPreApplyFunctionDefaultContracts(
          snapshot.globalFunctionDefaultContracts,
        ));
        result.observations.push('gate0_hardening_pending');
      }
    } else if (phase === 'post-apply') {
      if (!snapshot.migrationApplied) result.errors.push('gate0_migration_not_applied');
      result.errors.push(...catalogErrors);
      if (result.errors.length === 0) {
        let probeErrors = [];
        try {
          probeErrors = await runRollbackOnlyWriteProbe(client);
          result.errors.push(...probeErrors);
        } catch (error) {
          result.errors.push(`gate0_write_probe_uncaught_failure:${safeErrorCode(error)}`);
        }

        try {
          const countsAfterProbe = await readFinancialStateCounts(client);
          const catalogAfterProbe = await readCatalogSnapshot(client);
          if (!catalogAndStateMatch(counts, countsAfterProbe)) {
            result.errors.push('gate0_probe_financial_state_not_restored');
          }
          if (!catalogAndStateMatch(snapshot, catalogAfterProbe)) {
            result.errors.push('gate0_probe_catalog_not_restored');
          }
        } catch (error) {
          result.errors.push(`gate0_probe_post_cleanup_reread_failed:${safeErrorCode(error)}`);
        }
        result.catalog.rollbackOnlyWriteProbePassed = result.errors.length === 0
          && probeErrors.length === 0;
      }
    } else {
      result.observations.push(...catalogErrors);
    }
  } catch (error) {
    result.errors.push(`gate0_database_verification_failed:${safeErrorCode(error)}`);
    if (readOnlyTransactionOpen) {
      try {
        await client.query('rollback');
        readOnlyTransactionOpen = false;
      } catch (rollbackError) {
        result.errors.push(
          `gate0_read_only_rollback_failed:${safeErrorCode(rollbackError)}`,
        );
      }
    }
  } finally {
    if (connected) {
      try {
        await client.end();
      } catch (error) {
        result.errors.push(`gate0_connection_cleanup_failed:${safeErrorCode(error)}`);
      }
    }
  }
}

result.ok = result.errors.length === 0;
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedAsScript) await main();
