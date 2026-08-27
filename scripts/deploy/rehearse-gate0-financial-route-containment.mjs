import { readFileSync } from 'node:fs';
import {
  loadStagingMigrationLedger,
  orderedRemoteStatementLedgerSha256,
  orderedVersionNameMd5,
  rawSha256,
} from './staging-migration-ledger.mjs';
import { findUnsafeTopLevelMigrationStatements } from './migration-transaction-safety.mjs';
import { createVerifiedSupabasePostgresClient } from './verified-supabase-postgres.mjs';
import {
  readCatalogSnapshot,
  readFinancialStateCounts,
  findUnsafeFinancialStateCounts,
  runRollbackOnlyWriteProbe,
  verifyCatalog,
  verifyPreApplyFunctionDefaultContracts,
} from './verify-gate0-financial-route-containment.mjs';

const DB_URL_ENVIRONMENT = 'STACKR_SOURCE_DB_URL';
const ledger = loadStagingMigrationLedger(undefined, {
  requireResolvableProvenance: true,
});
const gate0 = ledger.pendingEntries[0];
const migrationSql = readFileSync(gate0.sourcePath, 'utf8');
const result = {
  ok: false,
  projectRef: ledger.manifest.projectRef,
  migrationVersion: gate0.version,
  migrationSha256: rawSha256(migrationSql),
  rollbackOnly: true,
  remoteHistory: {},
  before: {},
  appliedInsideTransaction: {},
  afterRollback: {},
  fullPostApplyProof: {},
  transactionAttestation: {},
  rollbackVerified: false,
  errors: [],
};

function safeErrorCode(error) {
  const code = String(error?.code ?? 'unknown');
  return /^[A-Z0-9_]{1,32}$/.test(code) ? code : 'unknown';
}

function assertEqual(actual, expected, error) {
  if (actual !== expected) result.errors.push(error);
}

function stableCatalogDigest(snapshot) {
  const normalized = {};
  for (const [name, value] of Object.entries(snapshot).sort()) {
    normalized[name] = Array.isArray(value)
      ? [...value].sort((left, right) => (
        JSON.stringify(left).localeCompare(JSON.stringify(right))
      ))
      : value;
  }
  return rawSha256(JSON.stringify(normalized));
}

function verifyFullFinancialCounts(counts) {
  for (const name of findUnsafeFinancialStateCounts(counts)) {
    result.errors.push(`gate0_rehearsal_post_apply_state_not_zero:${name}`);
  }
}

async function readRemoteHistory(client) {
  const history = await client.query(`
    select
      version,
      name,
      cardinality(statements)::int as statement_count,
      encode(
        extensions.digest(array_to_json(statements)::text, 'sha256'),
        'hex'
      ) as "remoteStatementsSha256"
    from supabase_migrations.schema_migrations
    order by version
  `);
  return history.rows;
}

async function readTransactionIdentity(client) {
  const identity = await client.query(`
    select
      pg_catalog.pg_backend_pid()::int as backend_pid,
      pg_catalog.txid_current()::text as transaction_id
  `);
  if (identity.rowCount !== 1 || identity.rows.length !== 1) {
    throw new Error('gate0_rehearsal_transaction_identity_invalid');
  }
  return identity.rows[0];
}

async function readGate0Snapshot(client) {
  const snapshot = await client.query(`
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
      ) as function_markers,
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
      ) as invalid_sender_offer_cards_at_apply,
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
      ) as blocked_trade_offer_states,
      (
        select count(*)::int
        from public.trade_offer_events
        where proposed_cash_amount is not null
          or event_type is null
          or event_type not in (
            'offer_created', 'message', 'counter_offer', 'pending',
            'accepted', 'declined', 'cancelled', 'disputed'
          )
          or proposed_status not in (
            'pending', 'accepted', 'declined', 'cancelled', 'disputed'
          )
      ) as blocked_trade_event_states,
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
        from public.user_card_flags
        where payment_intent_id is not null
      ) as listing_payment_bindings,
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
        from public.user_card_flags
        where flag_type = 'trade'
          and listing_status = 'archived'
      ) as archived_trade_listings,
      (select count(*)::int from public.user_card_flags) as total_card_flags,
      (
        select count(*)::int
        from public.profiles
        where stripe_account_id is not null
      ) as profile_stripe_bindings,
      (select count(*)::int from public.family_purchase_requests)
        as family_purchase_requests,
      (select count(*)::int from public.trade_listings)
        as legacy_trade_listings,
      (select count(*)::int from public.marketplace_listings)
        as legacy_marketplace_listings
  `);
  return Object.fromEntries(
    Object.entries(snapshot.rows[0]).map(([name, value]) => [name, Number(value)]),
  );
}

async function readSafeTradeRowDigests(client) {
  const digests = await client.query(`
    select
      encode(
        extensions.digest(
          coalesce((
            select pg_catalog.jsonb_agg(row_json order by row_json::text)::text
            from (
              select pg_catalog.to_jsonb(offer_row) as row_json
              from public.trade_offers as offer_row
            ) as offer_rows
          ), '[]'),
          'sha256'
        ),
        'hex'
      ) as trade_offers_sha256,
      encode(
        extensions.digest(
          coalesce((
            select pg_catalog.jsonb_agg(row_json order by row_json::text)::text
            from (
              select pg_catalog.to_jsonb(event_row) as row_json
              from public.trade_offer_events as event_row
            ) as event_rows
          ), '[]'),
          'sha256'
        ),
        'hex'
      ) as trade_offer_events_sha256,
      encode(
        extensions.digest(
          coalesce((
            select pg_catalog.jsonb_agg(row_json order by row_json::text)::text
            from (
              select pg_catalog.to_jsonb(card_row) as row_json
              from public.trade_offer_cards as card_row
            ) as card_rows
          ), '[]'),
          'sha256'
        ),
        'hex'
      ) as trade_offer_cards_sha256
  `);
  if (digests.rowCount !== 1 || digests.rows.length !== 1) {
    throw new Error('gate0_safe_trade_digest_row_count_invalid');
  }
  return digests.rows[0];
}

function verifyExactPendingHistory(remoteHistory) {
  assertEqual(
    remoteHistory.length,
    ledger.appliedEntries.length,
    'gate0_rehearsal_remote_history_not_exactly_pending',
  );
  assertEqual(
    orderedVersionNameMd5(remoteHistory),
    orderedVersionNameMd5(ledger.appliedEntries),
    'gate0_rehearsal_remote_history_order_drift',
  );
  assertEqual(
    orderedRemoteStatementLedgerSha256(remoteHistory),
    ledger.manifest.expectedAppliedRemoteStatementLedgerSha256,
    'gate0_rehearsal_remote_statement_hash_drift',
  );
  if (remoteHistory.some((entry) => (
    !Number.isInteger(entry.statement_count) || entry.statement_count <= 0
  ))) {
    result.errors.push('gate0_rehearsal_remote_statements_missing');
  }
}

function verifyPreApplySnapshot(snapshot) {
  for (const marker of [
    'constraint_markers',
    'trigger_markers',
    'policy_markers',
    'function_markers',
  ]) assertEqual(snapshot[marker], 0, `gate0_rehearsal_partial_state:${marker}`);

  for (const state of [
    'cash_terms',
    'legacy_fulfilment_rows',
    'trade_review_rows',
    'trader_rating_rows',
    'invalid_trade_offer_bindings',
    'invalid_disputed_trade_offers',
    'invalid_trade_offer_card_owners',
    'invalid_sender_offer_cards_at_apply',
    'blocked_trade_offer_states',
    'blocked_trade_event_states',
    'invalid_disputed_events',
    'listing_payment_bindings',
    'sold_listing_states',
    'profile_stripe_bindings',
    'family_purchase_requests',
    'legacy_trade_listings',
    'legacy_marketplace_listings',
  ]) assertEqual(snapshot[state], 0, `gate0_rehearsal_financial_state_not_zero:${state}`);
}

function verifyAppliedSnapshot(before, applied) {
  assertEqual(applied.constraint_markers, 14, 'gate0_rehearsal_constraint_count');
  assertEqual(applied.trigger_markers, 17, 'gate0_rehearsal_trigger_count');
  assertEqual(applied.policy_markers, 26, 'gate0_rehearsal_policy_count');
  assertEqual(applied.function_markers, 10, 'gate0_rehearsal_function_count');
  assertEqual(
    applied.unentitled_active_trade_listings,
    0,
    'gate0_rehearsal_unentitled_listing_remained_active',
  );
  assertEqual(
    applied.archived_trade_listings,
    before.archived_trade_listings + before.unentitled_active_trade_listings,
    'gate0_rehearsal_unentitled_listing_archive_count',
  );
  assertEqual(
    applied.total_card_flags,
    before.total_card_flags,
    'gate0_rehearsal_listing_row_preservation',
  );
  assertEqual(
    applied.trade_offer_rows,
    before.trade_offer_rows,
    'gate0_rehearsal_safe_trade_offer_row_preservation',
  );
  assertEqual(
    applied.trade_offer_event_rows,
    before.trade_offer_event_rows,
    'gate0_rehearsal_safe_trade_offer_event_row_preservation',
  );
  assertEqual(
    applied.trade_offer_card_rows,
    before.trade_offer_card_rows,
    'gate0_rehearsal_trade_offer_card_row_preservation',
  );
  verifyPreApplySnapshot({
    ...applied,
    constraint_markers: 0,
    trigger_markers: 0,
    policy_markers: 0,
    function_markers: 0,
  });
}

if (process.env.SUPABASE_PROJECT_REF !== ledger.manifest.projectRef) {
  result.errors.push('gate0_rehearsal_project_ref_mismatch');
}
if (result.migrationSha256 !== gate0.sourceSha256) {
  result.errors.push('gate0_rehearsal_migration_hash_drift');
}
for (const violation of findUnsafeTopLevelMigrationStatements(migrationSql)) {
  result.errors.push(`gate0_rehearsal_unsafe_migration_sql:${violation.code}`);
}
const dbUrl = process.env[DB_URL_ENVIRONMENT];
if (!dbUrl) result.errors.push(`missing_gate0_rehearsal_database_url:${DB_URL_ENVIRONMENT}`);

if (result.errors.length === 0) {
  const client = createVerifiedSupabasePostgresClient(
    dbUrl,
    'stackr-gate0-rollback-rehearsal',
    { statement_timeout: 180_000, query_timeout: 190_000 },
  );
  let connected = false;
  let transactionOpen = false;
  let transactionStarted = false;
  let remoteHistoryBefore = null;
  let before = null;
  let beforeCatalog = null;
  let safeTradeRowsBefore = null;
  try {
    await client.connect();
    connected = true;
    remoteHistoryBefore = await readRemoteHistory(client);
    verifyExactPendingHistory(remoteHistoryBefore);
    result.remoteHistory = {
      entryCount: remoteHistoryBefore.length,
      orderedVersionNameMd5: orderedVersionNameMd5(remoteHistoryBefore),
      statementLedgerSha256: orderedRemoteStatementLedgerSha256(remoteHistoryBefore),
    };

    await client.query('begin isolation level repeatable read');
    transactionOpen = true;
    transactionStarted = true;
    const transactionIdentityBefore = await readTransactionIdentity(client);
    result.transactionAttestation.before = transactionIdentityBefore;
    before = await readGate0Snapshot(client);
    beforeCatalog = await readCatalogSnapshot(client);
    safeTradeRowsBefore = await readSafeTradeRowDigests(client);
    result.before = {
      ...before,
      catalogDigest: stableCatalogDigest(beforeCatalog),
      safeTradeRowDigests: safeTradeRowsBefore,
    };
    verifyPreApplySnapshot(before);
    result.errors.push(...verifyPreApplyFunctionDefaultContracts(
      beforeCatalog.globalFunctionDefaultContracts,
    ).map((error) => (
      `gate0_rehearsal_preflight_${error}`
    )));

    if (result.errors.length === 0) {
      try {
        await client.query(migrationSql);

        const historyInside = await readRemoteHistory(client);
        verifyExactPendingHistory(historyInside);
        const applied = await readGate0Snapshot(client);
        result.appliedInsideTransaction = applied;
        verifyAppliedSnapshot(before, applied);
        const safeTradeRowsApplied = await readSafeTradeRowDigests(client);
        for (const [name, digest] of Object.entries(safeTradeRowsBefore)) {
          assertEqual(
            safeTradeRowsApplied[name],
            digest,
            `gate0_rehearsal_safe_trade_row_drift:${name}`,
          );
        }

        const fullCounts = await readFinancialStateCounts(client);
        const fullCatalog = await readCatalogSnapshot(client);
        const transactionIdentityAfterCatalog = await readTransactionIdentity(client);
        result.transactionAttestation.afterCatalog = transactionIdentityAfterCatalog;
        assertEqual(
          transactionIdentityAfterCatalog.backend_pid,
          transactionIdentityBefore.backend_pid,
          'gate0_rehearsal_catalog_backend_changed',
        );
        assertEqual(
          transactionIdentityAfterCatalog.transaction_id,
          transactionIdentityBefore.transaction_id,
          'gate0_rehearsal_catalog_transaction_changed',
        );
        const catalogErrors = verifyCatalog(fullCatalog);
        verifyFullFinancialCounts(fullCounts);
        result.errors.push(...catalogErrors.map((error) => `gate0_rehearsal_${error}`));
        let behaviorProbeRan = false;
        let probeErrors = null;
        if (catalogErrors.length === 0) {
          behaviorProbeRan = true;
          probeErrors = await runRollbackOnlyWriteProbe(client, {
            outerTransaction: true,
          });
          result.errors.push(...probeErrors.map((error) => (
            `gate0_rehearsal_${error}`
          )));
        }
        result.fullPostApplyProof = {
          catalogDigest: stableCatalogDigest(fullCatalog),
          catalogErrorCount: catalogErrors.length,
          behaviorProbeRan,
          behaviorProbeErrorCount: behaviorProbeRan ? probeErrors.length : null,
          financialStateCounts: fullCounts,
          safeTradeRowDigests: safeTradeRowsApplied,
        };
      } catch (error) {
        result.errors.push(`gate0_rehearsal_apply_or_probe_failed:${safeErrorCode(error)}`);
      }
    }
  } catch (error) {
    result.errors.push(`gate0_rehearsal_failed:${safeErrorCode(error)}`);
  } finally {
    if (transactionOpen) {
      try {
        await client.query('rollback');
        transactionOpen = false;
      } catch (error) {
        result.errors.push(`gate0_rehearsal_rollback_failed:${safeErrorCode(error)}`);
      }
    }

    if (connected && transactionStarted && remoteHistoryBefore && before
      && beforeCatalog && safeTradeRowsBefore) {
      try {
        const historyAfter = await readRemoteHistory(client);
        verifyExactPendingHistory(historyAfter);
        if (JSON.stringify(historyAfter) !== JSON.stringify(remoteHistoryBefore)) {
          result.errors.push('gate0_rehearsal_rollback_history_drift');
        }
        const afterRollback = await readGate0Snapshot(client);
        const afterRollbackCatalog = await readCatalogSnapshot(client);
        const safeTradeRowsAfterRollback = await readSafeTradeRowDigests(client);
        result.afterRollback = {
          ...afterRollback,
          catalogDigest: stableCatalogDigest(afterRollbackCatalog),
          safeTradeRowDigests: safeTradeRowsAfterRollback,
        };
        if (JSON.stringify(afterRollback) !== JSON.stringify(before)) {
          result.errors.push('gate0_rehearsal_rollback_state_drift');
        }
        if (stableCatalogDigest(afterRollbackCatalog)
          !== stableCatalogDigest(beforeCatalog)) {
          result.errors.push('gate0_rehearsal_rollback_catalog_drift');
        }
        if (JSON.stringify(safeTradeRowsAfterRollback)
          !== JSON.stringify(safeTradeRowsBefore)) {
          result.errors.push('gate0_rehearsal_rollback_safe_trade_row_drift');
        }
        result.rollbackVerified = !result.errors.some((error) => (
          error.startsWith('gate0_rehearsal_rollback_')
        ));
      } catch (error) {
        result.errors.push(`gate0_rehearsal_restoration_verification_failed:${safeErrorCode(error)}`);
      }
    }

    if (connected) {
      try {
        await client.end();
      } catch (error) {
        result.errors.push(`gate0_rehearsal_connection_cleanup_failed:${safeErrorCode(error)}`);
      }
    }
  }
}

result.ok = result.errors.length === 0;
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
