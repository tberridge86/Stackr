create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

alter table public.user_card_flags
  add column if not exists payment_intent_id text null,
  add column if not exists payment_status text null,
  add column if not exists reserved_by uuid null references auth.users(id) on delete set null,
  add column if not exists reserved_at timestamptz null,
  add column if not exists reservation_expires_at timestamptz null,
  add column if not exists sold_to_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists payment_succeeded_at timestamptz null,
  add column if not exists payment_failed_at timestamptz null;

alter table public.user_card_flags
  drop constraint if exists user_card_flags_listing_status_valid;

alter table public.user_card_flags
  add constraint user_card_flags_listing_status_valid
  check (listing_status in ('active', 'reserved', 'archived', 'sold'));

alter table public.user_card_flags
  drop constraint if exists user_card_flags_payment_status_valid;

alter table public.user_card_flags
  add constraint user_card_flags_payment_status_valid
  check (
    payment_status is null
    or payment_status in (
      'requires_payment_method',
      'requires_action',
      'processing',
      'succeeded',
      'failed',
      'canceled'
    )
  );

alter table public.user_card_flags
  drop constraint if exists user_card_flags_reserved_payment_complete;

alter table public.user_card_flags
  add constraint user_card_flags_reserved_payment_complete
  check (
    listing_status <> 'reserved'
    or (
      payment_intent_id is not null
      and reserved_by is not null
      and reserved_at is not null
      and reservation_expires_at is not null
    )
  );

create unique index if not exists user_card_flags_payment_intent_unique_idx
  on public.user_card_flags(payment_intent_id)
  where payment_intent_id is not null;

create index if not exists user_card_flags_reservation_expiry_idx
  on public.user_card_flags(reservation_expires_at, id)
  where listing_status = 'reserved';

create table if not exists public.marketplace_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null,
  payment_intent_id text not null unique,
  request_id text not null,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency = lower(currency) and currency ~ '^[a-z]{3}$'),
  status text not null check (
    status in (
      'requires_payment_method',
      'requires_action',
      'processing',
      'succeeded',
      'failed',
      'canceled'
    )
  ),
  reservation_expires_at timestamptz not null,
  last_event_id text null,
  last_event_created_at timestamptz null,
  failure_code text null,
  succeeded_at timestamptz null,
  failed_at timestamptz null,
  canceled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> seller_id),
  check (octet_length(listing_id) between 1 and 512),
  check (octet_length(payment_intent_id) between 4 and 255),
  check (request_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
  check (failure_code is null or octet_length(failure_code) <= 160)
);

create index if not exists marketplace_payment_transactions_listing_idx
  on public.marketplace_payment_transactions(listing_id, created_at desc);

create index if not exists marketplace_payment_transactions_participants_idx
  on public.marketplace_payment_transactions(buyer_id, seller_id, created_at desc);

create index if not exists marketplace_payment_transactions_status_idx
  on public.marketplace_payment_transactions(status, updated_at)
  where status not in ('succeeded', 'canceled');

alter table public.marketplace_payment_transactions enable row level security;

revoke all on table public.marketplace_payment_transactions from public, anon, authenticated;
grant select on table public.marketplace_payment_transactions to authenticated;
grant select, insert, update, delete on table public.marketplace_payment_transactions to service_role;

drop policy if exists marketplace_payment_participants_read
  on public.marketplace_payment_transactions;
create policy marketplace_payment_participants_read
  on public.marketplace_payment_transactions
  for select
  to authenticated
  using (
    (select auth.uid()) = buyer_id
    or (select auth.uid()) = seller_id
  );

create table if not exists private.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  payment_intent_id text null,
  transaction_id uuid null references public.marketplace_payment_transactions(id) on delete set null,
  livemode boolean not null,
  event_created_at timestamptz not null,
  outcome text not null default 'received' check (
    outcome in ('received', 'processed', 'ignored', 'ignored_stale')
  ),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 4096
  ),
  received_at timestamptz not null default now(),
  processed_at timestamptz null,
  check (event_id ~ '^evt_[A-Za-z0-9_]+$'),
  check (octet_length(event_type) between 1 and 160),
  check (payment_intent_id is null or octet_length(payment_intent_id) between 4 and 255)
);

create index if not exists stripe_webhook_events_payment_intent_idx
  on private.stripe_webhook_events(payment_intent_id, event_created_at desc)
  where payment_intent_id is not null;

alter table private.stripe_webhook_events enable row level security;

revoke all on table private.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on table private.stripe_webhook_events to service_role;

create or replace function private.guard_marketplace_payment_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'INSERT' then
      if new.listing_status = 'reserved'
        or new.payment_intent_id is not null
        or new.payment_status is not null
        or new.reserved_by is not null
        or new.reserved_at is not null
        or new.reservation_expires_at is not null
        or new.sold_to_user_id is not null
        or new.payment_succeeded_at is not null
        or new.payment_failed_at is not null then
        raise exception 'marketplace_payment_columns_are_server_managed'
          using errcode = '42501';
      end if;
    elsif new.payment_intent_id is distinct from old.payment_intent_id
      or new.payment_status is distinct from old.payment_status
      or new.reserved_by is distinct from old.reserved_by
      or new.reserved_at is distinct from old.reserved_at
      or new.reservation_expires_at is distinct from old.reservation_expires_at
      or new.sold_to_user_id is distinct from old.sold_to_user_id
      or new.payment_succeeded_at is distinct from old.payment_succeeded_at
      or new.payment_failed_at is distinct from old.payment_failed_at
      or new.listing_status = 'reserved'
      or old.listing_status = 'reserved' then
      raise exception 'marketplace_payment_columns_are_server_managed'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_marketplace_payment_columns() from public, anon, authenticated;

drop trigger if exists guard_marketplace_payment_columns
  on public.user_card_flags;
create trigger guard_marketplace_payment_columns
before insert or update on public.user_card_flags
for each row execute function private.guard_marketplace_payment_columns();

create or replace function public.reserve_marketplace_listing_payment(
  p_listing_id text,
  p_payment_intent_id text,
  p_request_id text,
  p_buyer_id uuid,
  p_amount_minor bigint,
  p_currency text,
  p_reservation_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing record;
  v_transaction public.marketplace_payment_transactions%rowtype;
  v_expected_amount bigint;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_listing_id is null or octet_length(p_listing_id) not between 1 and 512
    or p_payment_intent_id is null or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
    or p_request_id is null or p_request_id !~ '^[A-Za-z0-9._:-]{1,160}$'
    or p_buyer_id is null
    or p_amount_minor is null or p_amount_minor < 1
    or lower(coalesce(p_currency, '')) <> 'gbp'
    or p_reservation_expires_at is null
    or p_reservation_expires_at <= v_now + interval '1 minute'
    or p_reservation_expires_at > v_now + interval '24 hours' then
    raise exception 'invalid_marketplace_payment_reservation'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('stackr_marketplace_payment'),
    pg_catalog.hashtext(p_listing_id)
  );

  select transaction_row.*
  into v_transaction
  from public.marketplace_payment_transactions transaction_row
  where transaction_row.payment_intent_id = p_payment_intent_id
  for update;

  if found then
    if v_transaction.listing_id <> p_listing_id
      or v_transaction.buyer_id <> p_buyer_id
      or v_transaction.amount_minor <> p_amount_minor
      or v_transaction.currency <> lower(p_currency) then
      raise exception 'marketplace_payment_idempotency_conflict'
        using errcode = '23505';
    end if;

    return pg_catalog.jsonb_build_object(
      'transactionId', v_transaction.id,
      'listingId', v_transaction.listing_id,
      'paymentIntentId', v_transaction.payment_intent_id,
      'status', v_transaction.status,
      'reservationExpiresAt', v_transaction.reservation_expires_at,
      'replayed', true
    );
  end if;

  select listing.*
  into v_listing
  from public.user_card_flags listing
  where listing.id::text = p_listing_id
    and listing.flag_type = 'trade'
  for update;

  if not found then
    raise exception 'marketplace_listing_not_found'
      using errcode = 'P0002';
  end if;

  if v_listing.user_id = p_buyer_id then
    raise exception 'marketplace_self_purchase_not_allowed'
      using errcode = '42501';
  end if;

  if v_listing.asking_price is null or v_listing.asking_price <= 0 then
    raise exception 'marketplace_listing_has_no_payable_price'
      using errcode = '22023';
  end if;

  v_expected_amount := pg_catalog.round(v_listing.asking_price * 100)::bigint;
  if v_expected_amount <> p_amount_minor then
    raise exception 'marketplace_listing_amount_mismatch'
      using errcode = '22023';
  end if;

  if v_listing.listing_status = 'reserved'
    and v_listing.payment_intent_id = p_payment_intent_id
    and v_listing.reserved_by = p_buyer_id then
    select transaction_row.*
    into v_transaction
    from public.marketplace_payment_transactions transaction_row
    where transaction_row.payment_intent_id = p_payment_intent_id;

    if not found then
      raise exception 'marketplace_payment_transaction_missing'
        using errcode = '55000';
    end if;

    return pg_catalog.jsonb_build_object(
      'transactionId', v_transaction.id,
      'listingId', v_transaction.listing_id,
      'paymentIntentId', v_transaction.payment_intent_id,
      'status', v_transaction.status,
      'reservationExpiresAt', v_transaction.reservation_expires_at,
      'replayed', true
    );
  end if;

  if v_listing.listing_status <> 'active' then
    raise exception 'marketplace_listing_unavailable'
      using errcode = '55000';
  end if;

  insert into public.marketplace_payment_transactions (
    listing_id,
    payment_intent_id,
    request_id,
    buyer_id,
    seller_id,
    amount_minor,
    currency,
    status,
    reservation_expires_at
  ) values (
    p_listing_id,
    p_payment_intent_id,
    p_request_id,
    p_buyer_id,
    v_listing.user_id,
    p_amount_minor,
    lower(p_currency),
    'requires_payment_method',
    p_reservation_expires_at
  )
  returning * into v_transaction;

  update public.user_card_flags listing
  set listing_status = 'reserved',
      payment_intent_id = p_payment_intent_id,
      payment_status = 'requires_payment_method',
      reserved_by = p_buyer_id,
      reserved_at = v_now,
      reservation_expires_at = p_reservation_expires_at,
      sold_to_user_id = null,
      payment_succeeded_at = null,
      payment_failed_at = null,
      updated_at = v_now
  where listing.id::text = p_listing_id;

  return pg_catalog.jsonb_build_object(
    'transactionId', v_transaction.id,
    'listingId', v_transaction.listing_id,
    'paymentIntentId', v_transaction.payment_intent_id,
    'status', v_transaction.status,
    'reservationExpiresAt', v_transaction.reservation_expires_at,
    'replayed', false
  );
end;
$$;

revoke all on function public.reserve_marketplace_listing_payment(
  text, text, text, uuid, bigint, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.reserve_marketplace_listing_payment(
  text, text, text, uuid, bigint, text, timestamptz
) to service_role;

create or replace function public.reconcile_stripe_payment_event(
  p_event_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_livemode boolean,
  p_payment_intent_id text,
  p_payment_status text,
  p_metadata jsonb default '{}'::jsonb,
  p_failure_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
  v_existing_event record;
  v_transaction public.marketplace_payment_transactions%rowtype;
  v_outcome text := 'processed';
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]+$'
    or p_event_type is null or octet_length(p_event_type) not between 1 and 160
    or p_event_created_at is null
    or p_livemode is null
    or jsonb_typeof(v_metadata) <> 'object'
    or octet_length(v_metadata::text) > 4096
    or (p_failure_code is not null and octet_length(p_failure_code) > 160) then
    raise exception 'invalid_stripe_webhook_event'
      using errcode = '22023';
  end if;

  insert into private.stripe_webhook_events (
    event_id,
    event_type,
    payment_intent_id,
    livemode,
    event_created_at,
    metadata
  ) values (
    p_event_id,
    p_event_type,
    p_payment_intent_id,
    p_livemode,
    p_event_created_at,
    v_metadata
  )
  on conflict (event_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select event_row.*
    into v_existing_event
    from private.stripe_webhook_events event_row
    where event_row.event_id = p_event_id;

    return pg_catalog.jsonb_build_object(
      'eventId', p_event_id,
      'outcome', v_existing_event.outcome,
      'transactionId', v_existing_event.transaction_id,
      'replayed', true
    );
  end if;

  if p_event_type not in (
    'payment_intent.processing',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'payment_intent.canceled'
  ) then
    update private.stripe_webhook_events event_row
    set outcome = 'ignored',
        processed_at = v_now
    where event_row.event_id = p_event_id;

    return pg_catalog.jsonb_build_object(
      'eventId', p_event_id,
      'outcome', 'ignored',
      'replayed', false
    );
  end if;

  if p_payment_intent_id is null or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$' then
    raise exception 'stripe_payment_intent_id_required'
      using errcode = '22023';
  end if;

  select transaction_row.*
  into v_transaction
  from public.marketplace_payment_transactions transaction_row
  where transaction_row.payment_intent_id = p_payment_intent_id
  for update;

  if not found then
    raise exception 'marketplace_payment_transaction_not_found'
      using errcode = 'P0002';
  end if;

  if nullif(v_metadata ->> 'listingId', '') is not null
    and (v_metadata ->> 'listingId') <> v_transaction.listing_id then
    raise exception 'stripe_event_listing_identity_mismatch'
      using errcode = '22023';
  end if;

  if nullif(v_metadata ->> 'buyerId', '') is not null
    and (v_metadata ->> 'buyerId') <> v_transaction.buyer_id::text then
    raise exception 'stripe_event_buyer_identity_mismatch'
      using errcode = '22023';
  end if;

  if v_transaction.last_event_created_at is not null
    and p_event_created_at < v_transaction.last_event_created_at then
    v_outcome := 'ignored_stale';
  elsif v_transaction.status = 'succeeded'
    and p_event_type <> 'payment_intent.succeeded' then
    v_outcome := 'ignored_stale';
  end if;

  if v_outcome = 'ignored_stale' then
    update private.stripe_webhook_events event_row
    set transaction_id = v_transaction.id,
        outcome = v_outcome,
        processed_at = v_now
    where event_row.event_id = p_event_id;

    return pg_catalog.jsonb_build_object(
      'eventId', p_event_id,
      'outcome', v_outcome,
      'transactionId', v_transaction.id,
      'replayed', false
    );
  end if;

  if p_event_type = 'payment_intent.succeeded' then
    update public.marketplace_payment_transactions transaction_row
    set status = 'succeeded',
        last_event_id = p_event_id,
        last_event_created_at = p_event_created_at,
        failure_code = null,
        succeeded_at = coalesce(transaction_row.succeeded_at, p_event_created_at),
        updated_at = v_now
    where transaction_row.id = v_transaction.id;

    update public.user_card_flags listing
    set listing_status = 'sold',
        payment_status = 'succeeded',
        sold_to_user_id = v_transaction.buyer_id,
        payment_succeeded_at = coalesce(listing.payment_succeeded_at, p_event_created_at),
        payment_failed_at = null,
        reservation_expires_at = null,
        updated_at = v_now
    where listing.id::text = v_transaction.listing_id
      and listing.payment_intent_id = p_payment_intent_id
      and listing.listing_status in ('reserved', 'sold');

    if not found then
      raise exception 'marketplace_listing_payment_identity_mismatch'
        using errcode = '55000';
    end if;
  elsif p_event_type = 'payment_intent.processing' then
    update public.marketplace_payment_transactions transaction_row
    set status = 'processing',
        last_event_id = p_event_id,
        last_event_created_at = p_event_created_at,
        updated_at = v_now
    where transaction_row.id = v_transaction.id;

    update public.user_card_flags listing
    set payment_status = 'processing',
        updated_at = v_now
    where listing.id::text = v_transaction.listing_id
      and listing.payment_intent_id = p_payment_intent_id
      and listing.listing_status = 'reserved';

    if not found then
      raise exception 'marketplace_listing_payment_identity_mismatch'
        using errcode = '55000';
    end if;
  elsif p_event_type = 'payment_intent.payment_failed' then
    update public.marketplace_payment_transactions transaction_row
    set status = 'failed',
        last_event_id = p_event_id,
        last_event_created_at = p_event_created_at,
        failure_code = p_failure_code,
        failed_at = p_event_created_at,
        updated_at = v_now
    where transaction_row.id = v_transaction.id;

    -- A PaymentIntent can be retried after payment_failed. Keep the listing
    -- reserved until Stripe cancels it or a verified expiry reconciler releases it.
    update public.user_card_flags listing
    set payment_status = 'failed',
        payment_failed_at = p_event_created_at,
        updated_at = v_now
    where listing.id::text = v_transaction.listing_id
      and listing.payment_intent_id = p_payment_intent_id
      and listing.listing_status = 'reserved';

    if not found then
      raise exception 'marketplace_listing_payment_identity_mismatch'
        using errcode = '55000';
    end if;
  elsif p_event_type = 'payment_intent.canceled' then
    update public.marketplace_payment_transactions transaction_row
    set status = 'canceled',
        last_event_id = p_event_id,
        last_event_created_at = p_event_created_at,
        failure_code = p_failure_code,
        canceled_at = p_event_created_at,
        updated_at = v_now
    where transaction_row.id = v_transaction.id;

    update public.user_card_flags listing
    set listing_status = 'active',
        payment_intent_id = null,
        payment_status = null,
        reserved_by = null,
        reserved_at = null,
        reservation_expires_at = null,
        sold_to_user_id = null,
        payment_succeeded_at = null,
        payment_failed_at = p_event_created_at,
        updated_at = v_now
    where listing.id::text = v_transaction.listing_id
      and listing.payment_intent_id = p_payment_intent_id
      and listing.listing_status = 'reserved';

    if not found then
      select listing.*
      into v_existing_event
      from public.user_card_flags listing
      where listing.id::text = v_transaction.listing_id;

      if not found
        or v_existing_event.listing_status <> 'active'
        or v_existing_event.payment_intent_id is not null then
        raise exception 'marketplace_listing_payment_identity_mismatch'
          using errcode = '55000';
      end if;
    end if;
  end if;

  update private.stripe_webhook_events event_row
  set transaction_id = v_transaction.id,
      outcome = v_outcome,
      processed_at = v_now
  where event_row.event_id = p_event_id;

  return pg_catalog.jsonb_build_object(
    'eventId', p_event_id,
    'outcome', v_outcome,
    'transactionId', v_transaction.id,
    'paymentIntentId', p_payment_intent_id,
    'paymentStatus', p_payment_status,
    'replayed', false
  );
end;
$$;

revoke all on function public.reconcile_stripe_payment_event(
  text, text, timestamptz, boolean, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.reconcile_stripe_payment_event(
  text, text, timestamptz, boolean, text, text, jsonb, text
) to service_role;

comment on table public.marketplace_payment_transactions is
  'Server-managed marketplace payment ledger. Buyers and sellers can read only transactions they participate in.';

comment on table private.stripe_webhook_events is
  'Minimal Stripe event ledger used for duplicate delivery protection and settlement audit.';

comment on function public.reserve_marketplace_listing_payment(
  text, text, text, uuid, bigint, text, timestamptz
) is
  'Atomically reserves an active listing and records the matching Stripe PaymentIntent. Service-role only.';

comment on function public.reconcile_stripe_payment_event(
  text, text, timestamptz, boolean, text, text, jsonb, text
) is
  'Idempotently reconciles verified Stripe PaymentIntent webhooks into marketplace state. Service-role only.';
