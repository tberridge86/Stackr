import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const databaseUrl = process.argv.find((value) => value.startsWith('--db-url='))?.slice(9);
if (!databaseUrl) throw new Error('database_url_required');
const parsedDatabaseUrl = new URL(databaseUrl);
const allowedTestHosts = new Set(['127.0.0.1', 'localhost', '::1']);
if (!allowedTestHosts.has(parsedDatabaseUrl.hostname)) {
  throw new Error('marketplace_payment_test_requires_local_disposable_database');
}

const migration = readFileSync(
  'supabase/migrations/20260819070000_marketplace_payment_settlement.sql',
  'utf8',
);
const compatibilityMigration = readFileSync(
  'supabase/migrations/20260819070100_private_schema_usage_compatibility.sql',
  'utf8',
);

const sellerId = '00000000-0000-0000-0000-000000000001';
const buyerId = '00000000-0000-0000-0000-000000000002';
const otherBuyerId = '00000000-0000-0000-0000-000000000003';
const outsiderId = '00000000-0000-0000-0000-000000000004';
const listingId = '10000000-0000-0000-0000-000000000001';
const cancellationListingId = '10000000-0000-0000-0000-000000000002';
const reservationExpiry = '2026-08-19T12:30:00.000Z';

async function resetFixture(client) {
  await client.query(`
    drop schema if exists private cascade;
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    create schema public;
    create schema auth;

    do $$
    begin
      create role anon nologin;
    exception when duplicate_object then null;
    end $$;
    do $$
    begin
      create role authenticated nologin;
    exception when duplicate_object then null;
    end $$;
    do $$
    begin
      create role service_role nologin;
    exception when duplicate_object then null;
    end $$;

    create function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    grant usage on schema auth to authenticated, service_role;

    create table auth.users (
      id uuid primary key
    );

    create table public.user_card_flags (
      id uuid primary key,
      user_id uuid not null references auth.users(id) on delete cascade,
      card_id text not null,
      set_id text null,
      flag_type text not null,
      asking_price numeric null,
      listing_status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint user_card_flags_listing_status_valid
        check (listing_status in ('active', 'archived', 'sold'))
    );

    alter table public.user_card_flags enable row level security;
    create policy user_card_flags_owner_policy
      on public.user_card_flags
      for all
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);

    grant usage on schema public to authenticated, service_role;
    grant select, insert, update, delete on public.user_card_flags to authenticated, service_role;

    insert into auth.users (id) values
      ('${sellerId}'),
      ('${buyerId}'),
      ('${otherBuyerId}'),
      ('${outsiderId}');

    insert into public.user_card_flags (
      id, user_id, card_id, set_id, flag_type, asking_price, listing_status
    ) values
      ('${listingId}', '${sellerId}', 'card-charizard', 'base1', 'trade', 19.99, 'active'),
      ('${cancellationListingId}', '${sellerId}', 'card-blastoise', 'base1', 'trade', 25.00, 'active');
  `);

  await client.query(migration);
  await client.query(compatibilityMigration);
}

async function setRole(client, role, userId = null) {
  await client.query('reset role');
  await client.query(`set role ${role}`);
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? '']);
}

async function reserve(client, {
  listing = listingId,
  paymentIntent = 'pi_stackr_market_001',
  requestId = 'payment-reservation-001',
  buyer = buyerId,
  amountMinor = 1999,
  expiresAt = reservationExpiry,
} = {}) {
  const result = await client.query(
    `select public.reserve_marketplace_listing_payment(
      $1::text,
      $2::text,
      $3::text,
      $4::uuid,
      $5::bigint,
      $6::text,
      $7::timestamptz
    ) as result`,
    [listing, paymentIntent, requestId, buyer, amountMinor, 'gbp', expiresAt],
  );
  return result.rows[0].result;
}

async function reconcile(client, {
  eventId,
  eventType,
  eventCreatedAt,
  paymentIntent = 'pi_stackr_market_001',
  paymentStatus,
  metadata = { listingId, buyerId, sellerId, type: 'market_purchase' },
  failureCode = null,
} = {}) {
  const result = await client.query(
    `select public.reconcile_stripe_payment_event(
      $1::text,
      $2::text,
      $3::timestamptz,
      $4::boolean,
      $5::text,
      $6::text,
      $7::jsonb,
      $8::text
    ) as result`,
    [
      eventId,
      eventType,
      eventCreatedAt,
      false,
      paymentIntent,
      paymentStatus,
      JSON.stringify(metadata),
      failureCode,
    ],
  );
  return result.rows[0].result;
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await resetFixture(client);

  const functionPrivileges = await client.query(`
    select
      has_function_privilege(
        'anon',
        'public.reserve_marketplace_listing_payment(text,text,text,uuid,bigint,text,timestamptz)',
        'execute'
      ) as anon_can_reserve,
      has_function_privilege(
        'authenticated',
        'public.reserve_marketplace_listing_payment(text,text,text,uuid,bigint,text,timestamptz)',
        'execute'
      ) as authenticated_can_reserve,
      has_function_privilege(
        'service_role',
        'public.reserve_marketplace_listing_payment(text,text,text,uuid,bigint,text,timestamptz)',
        'execute'
      ) as service_can_reserve,
      has_function_privilege(
        'authenticated',
        'public.reconcile_stripe_payment_event(text,text,timestamptz,boolean,text,text,jsonb,text)',
        'execute'
      ) as authenticated_can_reconcile,
      has_function_privilege(
        'service_role',
        'public.reconcile_stripe_payment_event(text,text,timestamptz,boolean,text,text,jsonb,text)',
        'execute'
      ) as service_can_reconcile,
      has_table_privilege('authenticated', 'private.stripe_webhook_events', 'select')
        as authenticated_can_read_event_ledger,
      has_table_privilege('authenticated', 'public.marketplace_payment_transactions', 'select')
        as authenticated_can_read_transactions,
      has_table_privilege('authenticated', 'public.marketplace_payment_transactions', 'insert')
        as authenticated_can_insert_transactions
  `);
  assert.deepEqual(functionPrivileges.rows[0], {
    anon_can_reserve: false,
    authenticated_can_reserve: false,
    service_can_reserve: true,
    authenticated_can_reconcile: false,
    service_can_reconcile: true,
    authenticated_can_read_event_ledger: false,
    authenticated_can_read_transactions: true,
    authenticated_can_insert_transactions: false,
  });

  await setRole(client, 'authenticated', sellerId);
  await assert.rejects(
    client.query(`
      update public.user_card_flags
      set listing_status = 'reserved',
          payment_intent_id = 'pi_client_forged',
          payment_status = 'requires_payment_method',
          reserved_by = '${buyerId}',
          reserved_at = now(),
          reservation_expires_at = now() + interval '30 minutes'
      where id = '${listingId}'
    `),
    (error) => error?.code === '42501'
      && /marketplace_payment_columns_are_server_managed/.test(error?.message),
  );

  await setRole(client, 'service_role');
  const firstReservation = await reserve(client);
  assert.equal(firstReservation.listingId, listingId);
  assert.equal(firstReservation.paymentIntentId, 'pi_stackr_market_001');
  assert.equal(firstReservation.replayed, false);

  const reservedState = await client.query(`
    select
      listing_status,
      payment_intent_id,
      payment_status,
      reserved_by::text,
      reservation_expires_at,
      sold_to_user_id
    from public.user_card_flags
    where id = $1
  `, [listingId]);
  assert.equal(reservedState.rows[0].listing_status, 'reserved');
  assert.equal(reservedState.rows[0].payment_intent_id, 'pi_stackr_market_001');
  assert.equal(reservedState.rows[0].payment_status, 'requires_payment_method');
  assert.equal(reservedState.rows[0].reserved_by, buyerId);
  assert.equal(reservedState.rows[0].sold_to_user_id, null);

  const transactionState = await client.query(`
    select listing_id, payment_intent_id, buyer_id::text, seller_id::text,
           amount_minor::int, currency, status
    from public.marketplace_payment_transactions
    where payment_intent_id = 'pi_stackr_market_001'
  `);
  assert.deepEqual(transactionState.rows[0], {
    listing_id: listingId,
    payment_intent_id: 'pi_stackr_market_001',
    buyer_id: buyerId,
    seller_id: sellerId,
    amount_minor: 1999,
    currency: 'gbp',
    status: 'requires_payment_method',
  });

  const replay = await reserve(client);
  assert.equal(replay.replayed, true);
  const transactionCount = await client.query(`
    select count(*)::int as count
    from public.marketplace_payment_transactions
    where listing_id = $1
  `, [listingId]);
  assert.equal(transactionCount.rows[0].count, 1);

  await assert.rejects(
    reserve(client, {
      paymentIntent: 'pi_stackr_market_loser',
      requestId: 'payment-reservation-loser',
      buyer: otherBuyerId,
    }),
    (error) => error?.code === '55000'
      && /marketplace_listing_unavailable/.test(error?.message),
  );

  const processing = await reconcile(client, {
    eventId: 'evt_stackr_processing_001',
    eventType: 'payment_intent.processing',
    eventCreatedAt: '2026-08-19T11:01:00.000Z',
    paymentStatus: 'processing',
  });
  assert.equal(processing.outcome, 'processed');

  const processingReplay = await reconcile(client, {
    eventId: 'evt_stackr_processing_001',
    eventType: 'payment_intent.processing',
    eventCreatedAt: '2026-08-19T11:01:00.000Z',
    paymentStatus: 'processing',
  });
  assert.equal(processingReplay.replayed, true);

  const failed = await reconcile(client, {
    eventId: 'evt_stackr_failed_001',
    eventType: 'payment_intent.payment_failed',
    eventCreatedAt: '2026-08-19T11:02:00.000Z',
    paymentStatus: 'requires_payment_method',
    failureCode: 'card_declined',
  });
  assert.equal(failed.outcome, 'processed');

  const afterFailure = await client.query(`
    select listing_status, payment_status, payment_intent_id
    from public.user_card_flags where id = $1
  `, [listingId]);
  assert.deepEqual(afterFailure.rows[0], {
    listing_status: 'reserved',
    payment_status: 'failed',
    payment_intent_id: 'pi_stackr_market_001',
  });

  const stale = await reconcile(client, {
    eventId: 'evt_stackr_stale_001',
    eventType: 'payment_intent.processing',
    eventCreatedAt: '2026-08-19T11:01:30.000Z',
    paymentStatus: 'processing',
  });
  assert.equal(stale.outcome, 'ignored_stale');

  const succeeded = await reconcile(client, {
    eventId: 'evt_stackr_succeeded_001',
    eventType: 'payment_intent.succeeded',
    eventCreatedAt: '2026-08-19T11:03:00.000Z',
    paymentStatus: 'succeeded',
  });
  assert.equal(succeeded.outcome, 'processed');

  const soldState = await client.query(`
    select listing_status, payment_status, sold_to_user_id::text,
           payment_intent_id, reservation_expires_at
    from public.user_card_flags where id = $1
  `, [listingId]);
  assert.deepEqual(soldState.rows[0], {
    listing_status: 'sold',
    payment_status: 'succeeded',
    sold_to_user_id: buyerId,
    payment_intent_id: 'pi_stackr_market_001',
    reservation_expires_at: null,
  });

  const cancellationAfterSuccess = await reconcile(client, {
    eventId: 'evt_stackr_cancel_after_success',
    eventType: 'payment_intent.canceled',
    eventCreatedAt: '2026-08-19T11:04:00.000Z',
    paymentStatus: 'canceled',
    failureCode: 'requested_by_customer',
  });
  assert.equal(cancellationAfterSuccess.outcome, 'ignored_stale');

  const stillSold = await client.query(`
    select listing_status, payment_status from public.user_card_flags where id = $1
  `, [listingId]);
  assert.deepEqual(stillSold.rows[0], {
    listing_status: 'sold',
    payment_status: 'succeeded',
  });

  await reserve(client, {
    listing: cancellationListingId,
    paymentIntent: 'pi_stackr_cancel_001',
    requestId: 'payment-reservation-cancel',
    amountMinor: 2500,
  });
  const canceled = await reconcile(client, {
    eventId: 'evt_stackr_canceled_001',
    eventType: 'payment_intent.canceled',
    eventCreatedAt: '2026-08-19T11:05:00.000Z',
    paymentIntent: 'pi_stackr_cancel_001',
    paymentStatus: 'canceled',
    metadata: {
      listingId: cancellationListingId,
      buyerId,
      sellerId,
      type: 'market_purchase',
    },
    failureCode: 'abandoned',
  });
  assert.equal(canceled.outcome, 'processed');

  const releasedState = await client.query(`
    select listing_status, payment_intent_id, payment_status, reserved_by
    from public.user_card_flags where id = $1
  `, [cancellationListingId]);
  assert.deepEqual(releasedState.rows[0], {
    listing_status: 'active',
    payment_intent_id: null,
    payment_status: null,
    reserved_by: null,
  });

  const eventLedger = await client.query(`
    select event_id, outcome
    from private.stripe_webhook_events
    order by event_created_at, event_id
  `);
  assert.equal(eventLedger.rows.filter((row) => row.event_id === 'evt_stackr_processing_001').length, 1);
  assert.ok(eventLedger.rows.some((row) => row.event_id === 'evt_stackr_stale_001' && row.outcome === 'ignored_stale'));

  await setRole(client, 'authenticated', buyerId);
  const buyerRows = await client.query(`
    select payment_intent_id from public.marketplace_payment_transactions order by payment_intent_id
  `);
  assert.deepEqual(
    buyerRows.rows.map((row) => row.payment_intent_id),
    ['pi_stackr_cancel_001', 'pi_stackr_market_001'],
  );

  await setRole(client, 'authenticated', outsiderId);
  const outsiderRows = await client.query(`
    select payment_intent_id from public.marketplace_payment_transactions
  `);
  assert.equal(outsiderRows.rowCount, 0);

  await assert.rejects(
    client.query('select count(*) from private.stripe_webhook_events'),
    (error) => error?.code === '42501',
  );

  console.log('Marketplace payment settlement migration tests passed.');
} finally {
  await client.query('reset role').catch(() => undefined);
  await client.end();
}
