-- Gate 0 financial-route and legacy fulfilment containment.
--
-- Stripe, Shippo, cash-assisted trades, purchases and order fulfilment remain
-- outside this release. Deployment preflight and the atomic assertions below
-- require every forbidden financial/lifecycle row count to be zero. Safe
-- card-only negotiation rows are preserved, while every API role (including
-- service_role) is blocked from creating forbidden state.

set lock_timeout = '5s';
set statement_timeout = '120s';

create schema if not exists private;

-- Entitlements must be read from the current server-owned Auth record. A JWT
-- can remain valid after an administrator revokes a cohort, so signed token
-- claims alone are not a sufficient ongoing publication or write boundary.
create or replace function private.stackr_gate0_user_has_premium_seller(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from auth.users as entitled_user
    where entitled_user.id = p_user_id
      and coalesce(
        entitled_user.raw_app_meta_data
          -> 'stackr_premium_seller' = 'true'::jsonb,
        false
      )
  );
$function$;

alter function private.stackr_gate0_user_has_premium_seller(uuid)
  owner to postgres;
revoke all on function private.stackr_gate0_user_has_premium_seller(uuid)
  from public, anon, authenticated, service_role;
revoke create on schema private
  from public, anon, authenticated, service_role;
grant usage on schema private to anon, authenticated, service_role;
grant execute on function private.stackr_gate0_user_has_premium_seller(uuid)
  to anon, authenticated, service_role;

-- A card-trade dispute is a negotiation safety action, not a buyer/seller
-- order dispute. Resolve eligibility against the immutable offer/listing/card
-- binding so an API role cannot relabel an order, cash, empty or partially
-- constructed offer as a card-only dispute.
create or replace function private.stackr_gate0_card_trade_dispute_allowed(
  p_offer_id uuid,
  p_actor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.trade_offers as offer
    join public.user_card_flags as listing
      on listing.id = offer.listing_id
      and listing.user_id = offer.receiver_id
      and listing.flag_type = 'trade'
    where offer.id = p_offer_id
      and p_actor_id in (offer.sender_id, offer.receiver_id)
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
  );
$function$;

alter function private.stackr_gate0_card_trade_dispute_allowed(uuid, uuid)
  owner to postgres;
revoke all on function private.stackr_gate0_card_trade_dispute_allowed(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.stackr_gate0_card_trade_dispute_allowed(uuid, uuid)
  to authenticated;

create or replace function public.stackr_gate0_block_financial_write()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'gate0_financial_routes_disabled: blocked financial table write'
    using errcode = 'P0001';
end;
$function$;

create or replace function public.stackr_gate0_block_legacy_fulfilment_write()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'gate0_shipping_routes_disabled: legacy fulfilment write'
    using errcode = 'P0001';
end;
$function$;

create or replace function public.stackr_gate0_guard_profile_financial_binding()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' and new.stripe_account_id is not null then
    raise exception 'gate0_financial_routes_disabled: stripe account binding'
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE'
    and new.stripe_account_id is distinct from old.stripe_account_id
  then
    raise exception 'gate0_financial_routes_disabled: stripe account binding'
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

create or replace function public.stackr_gate0_guard_listing_financial_state()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    perform 1
    from public.trade_offers as bound_offer
    where bound_offer.listing_id = old.id
    limit 1
    for key share;

    if found then
      raise exception 'gate0_card_trade_listing_immutable: referenced listing delete disabled'
        using errcode = '42501';
    end if;

    if old.payment_intent_id is not null
      or old.listing_status = 'sold'
    then
      raise exception 'gate0_financial_routes_disabled: listing financial state'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT'
    and (
      new.payment_intent_id is not null
      or new.listing_status = 'sold'
    )
  then
    raise exception 'gate0_financial_routes_disabled: listing financial state'
      using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT'
    and new.flag_type = 'trade'
    and coalesce(new.listing_status, 'active') = 'active'
    and not private.stackr_gate0_user_has_premium_seller(new.user_id)
  then
    raise exception 'gate0_conditional_surface_disabled: active trade listing entitlement'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and (
      new.user_id is distinct from old.user_id
      or new.card_id is distinct from old.card_id
      or new.set_id is distinct from old.set_id
      or new.flag_type is distinct from old.flag_type
    )
    and (
      old.flag_type = 'trade'
      or new.flag_type = 'trade'
    )
  then
    raise exception 'gate0_card_trade_listing_immutable: trade listing identity disabled'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and (
      old.payment_intent_id is not null
      or new.payment_intent_id is distinct from old.payment_intent_id
      or old.listing_status = 'sold'
      or new.listing_status = 'sold'
    )
  then
    raise exception 'gate0_financial_routes_disabled: listing financial state'
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE'
    and new.flag_type = 'trade'
    and coalesce(new.listing_status, 'active') = 'active'
    and not private.stackr_gate0_user_has_premium_seller(new.user_id)
  then
    raise exception 'gate0_conditional_surface_disabled: active trade listing entitlement'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

create or replace function public.stackr_gate0_guard_trade_offer_financial_state()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  allowed_statuses constant text[] := array[
    'pending',
    'accepted',
    'declined',
    'cancelled',
    'disputed'
  ];
  bound_listing_owner_id uuid;
  bound_listing_flag_type text;
  bound_listing_status text;
begin
  if tg_op = 'DELETE' then
    if old.status is null
      or old.status <> all(allowed_statuses)
      or old.sender_sent is distinct from false
      or old.receiver_sent is distinct from false
      or old.sender_received is distinct from false
      or old.receiver_received is distinct from false
      or old.completed_at is not null
    then
      raise exception 'gate0_financial_shipping_routes_disabled: trade state'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if (select auth.uid()) is null
      or new.sender_id is distinct from (select auth.uid())
      or new.sender_id is not distinct from new.receiver_id
      or new.listing_id is null
    then
      raise exception 'gate0_card_trade_offer_invalid: authenticated distinct participants and listing required'
        using errcode = '42501';
    end if;

    -- Serialize offer creation with listing archival. A listing that is already
    -- inactive cannot receive a new offer, while an offer that acquired this
    -- row lock first remains a valid historical negotiation if the owner later
    -- archives the listing.
    select
      listing.user_id,
      listing.flag_type,
      coalesce(listing.listing_status, 'active')
    into
      bound_listing_owner_id,
      bound_listing_flag_type,
      bound_listing_status
    from public.user_card_flags as listing
    where listing.id = new.listing_id
    for share;

    if not found
      or bound_listing_owner_id is distinct from new.receiver_id
      or bound_listing_flag_type is distinct from 'trade'
      or bound_listing_status is distinct from 'active'
      or not private.stackr_gate0_user_has_premium_seller(
        bound_listing_owner_id
      )
    then
      raise exception 'gate0_card_trade_offer_invalid: active receiver listing required'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE'
    and (
      new.sender_id is distinct from old.sender_id
      or new.receiver_id is distinct from old.receiver_id
      or new.listing_id is distinct from old.listing_id
    )
  then
    raise exception 'gate0_card_trade_offer_invalid: participant/listing binding is immutable'
      using errcode = '42501';
  end if;

  if new.status is null
    or new.status <> all(allowed_statuses)
    or new.sender_sent is distinct from false
    or new.receiver_sent is distinct from false
    or new.sender_received is distinct from false
    or new.receiver_received is distinct from false
    or new.completed_at is not null
    or (
      tg_op = 'UPDATE'
      and (
        old.status is null
        or old.status <> all(allowed_statuses)
        or old.sender_sent is distinct from false
        or old.receiver_sent is distinct from false
        or old.sender_received is distinct from false
        or old.receiver_received is distinct from false
        or old.completed_at is not null
      )
    )
  then
    raise exception 'gate0_financial_shipping_routes_disabled: trade state'
      using errcode = 'P0001';
  end if;

  if new.status = 'disputed'
    and (
      tg_op = 'INSERT'
      or new.status is distinct from old.status
    )
    and not private.stackr_gate0_card_trade_dispute_allowed(
      new.id,
      (select auth.uid())
    )
  then
    raise exception 'gate0_card_trade_dispute_invalid: participant card-only offer required'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

create or replace function public.stackr_gate0_guard_trade_event_financial_state()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  allowed_events constant text[] := array[
    'offer_created',
    'message',
    'counter_offer',
    'pending',
    'accepted',
    'declined',
    'cancelled',
    'disputed'
  ];
  allowed_statuses constant text[] := array[
    'pending',
    'accepted',
    'declined',
    'cancelled',
    'disputed'
  ];
begin
  if tg_op = 'DELETE' then
    if old.proposed_cash_amount is not null
      or old.event_type is null
      or old.event_type <> all(allowed_events)
      or coalesce(old.proposed_status <> all(allowed_statuses), false)
    then
      raise exception 'gate0_financial_shipping_routes_disabled: trade event'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if new.proposed_cash_amount is not null
    or new.event_type is null
    or new.event_type <> all(allowed_events)
    or coalesce(new.proposed_status <> all(allowed_statuses), false)
    or (
      tg_op = 'UPDATE'
      and (
        old.proposed_cash_amount is not null
        or old.event_type is null
        or old.event_type <> all(allowed_events)
        or coalesce(old.proposed_status <> all(allowed_statuses), false)
      )
    )
  then
    raise exception 'gate0_financial_shipping_routes_disabled: trade event'
      using errcode = 'P0001';
  end if;

  if (
    new.event_type = 'disputed'
    or new.proposed_status = 'disputed'
  )
    and (
      new.user_id is distinct from (select auth.uid())
      or not private.stackr_gate0_card_trade_dispute_allowed(
        new.offer_id,
        (select auth.uid())
      )
    )
  then
    raise exception 'gate0_card_trade_dispute_invalid: participant card-only offer required'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- The offer sender creates both sides of a card-only offer in one client flow.
-- Receiver-owned rows must be the exact card/set published by the bound
-- listing. Sender-owned rows are accepted only while a matching positive
-- canonical ownership row is locked, making the ownership check stable for
-- the inserting transaction without turning historical offers into permanent
-- inventory reservations.
create or replace function public.stackr_gate0_guard_trade_offer_card_membership()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  actor_id uuid;
  initial_listing_id uuid;
  offer_sender_id uuid;
  offer_receiver_id uuid;
  offer_listing_id uuid;
  listing_card_id text;
  listing_set_id text;
  owned_variant_id uuid;
begin
  -- Gate 0 exposes INSERT only. Keeping membership rows immutable also closes
  -- the table-owner race where the final card could be deleted or moved after
  -- a concurrent transition made the offer disputed.
  if tg_op <> 'INSERT' then
    raise exception 'gate0_card_trade_membership_immutable: update/delete disabled'
      using errcode = '42501';
  end if;

  -- Read the immutable listing pointer first, then lock listing -> offer. Trade
  -- listing identity is frozen independently, while listing DELETE takes its
  -- tuple lock before checking referenced offers in the same order.
  select offer.listing_id
    into initial_listing_id
  from public.trade_offers as offer
  where offer.id = new.offer_id;

  if not found then
    raise exception 'gate0_card_trade_invalid: offer not found'
      using errcode = '23503';
  end if;

  select listing.card_id, listing.set_id
    into listing_card_id, listing_set_id
  from public.user_card_flags as listing
  where listing.id = initial_listing_id
  for share;

  if not found then
    raise exception 'gate0_card_trade_invalid: bound listing not found'
      using errcode = '23503';
  end if;

  select offer.sender_id, offer.receiver_id, offer.listing_id
    into offer_sender_id, offer_receiver_id, offer_listing_id
  from public.trade_offers as offer
  where offer.id = new.offer_id
  for update;

  if not found or offer_listing_id is distinct from initial_listing_id then
    raise exception 'gate0_card_trade_invalid: offer/listing binding changed'
      using errcode = '42501';
  end if;

  actor_id := (select auth.uid());
  if actor_id is null or actor_id is distinct from offer_sender_id then
    raise exception 'gate0_card_trade_invalid: offer sender actor required'
      using errcode = '42501';
  end if;

  if new.owner_id = offer_receiver_id then
    if new.card_id is distinct from listing_card_id
      or new.set_id is distinct from listing_set_id
    then
      raise exception 'gate0_card_trade_invalid: requested card must match bound listing'
        using errcode = '42501';
    end if;

    if exists (
      select 1
      from public.trade_offer_cards as existing_requested_card
      where existing_requested_card.offer_id = new.offer_id
        and existing_requested_card.owner_id = offer_receiver_id
    ) then
      raise exception 'gate0_card_trade_invalid: one requested listing card required'
        using errcode = '42501';
    end if;
  elsif new.owner_id = offer_sender_id then
    select owned_variant.id
      into owned_variant_id
    from public.user_card_variants as owned_variant
    where owned_variant.user_id = offer_sender_id
      and owned_variant.card_id = new.card_id
      and owned_variant.set_id = new.set_id
      and owned_variant.quantity > 0
    order by owned_variant.id
    limit 1
    for update;

    if not found then
      raise exception 'gate0_card_trade_invalid: offered card must be currently owned'
        using errcode = '42501';
    end if;
  else
    raise exception 'gate0_card_trade_invalid: card owner must be an offer participant'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

create or replace function public.stackr_gate0_guard_seller_entitlement()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  seller_user_id uuid;
begin
  seller_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;

  if not private.stackr_gate0_user_has_premium_seller(seller_user_id) then
    raise exception 'gate0_conditional_surface_disabled: premium seller entitlement'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'gate0_conditional_surface_disabled: seller ownership rewrite'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.stackr_gate0_block_financial_write()
  from public, anon, authenticated, service_role;
revoke all on function public.stackr_gate0_block_legacy_fulfilment_write()
  from public, anon, authenticated, service_role;
revoke all on function public.stackr_gate0_guard_profile_financial_binding()
  from public, anon, authenticated, service_role;
revoke all on function public.stackr_gate0_guard_listing_financial_state()
  from public, anon, authenticated, service_role;
revoke all on function public.stackr_gate0_guard_trade_offer_financial_state()
  from public, anon, authenticated, service_role;
revoke all on function public.stackr_gate0_guard_trade_event_financial_state()
  from public, anon, authenticated, service_role;
revoke all on function public.stackr_gate0_guard_trade_offer_card_membership()
  from public, anon, authenticated, service_role;
revoke all on function public.stackr_gate0_guard_seller_entitlement()
  from public, anon, authenticated, service_role;

alter table public.trade_cash_terms enable row level security;
alter table public.trades enable row level security;
alter table public.trade_offer_events enable row level security;
alter table public.trade_offers enable row level security;
alter table public.trade_offer_cards enable row level security;
alter table public.user_card_flags enable row level security;
alter table public.profiles enable row level security;
alter table public.trade_reviews enable row level security;
alter table public.trader_ratings enable row level security;
alter table public.seller_inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.seller_sale_transactions enable row level security;
alter table public.seller_sale_transaction_items enable row level security;
alter table private.seller_inventory_batch_commits enable row level security;

-- Existing permissive policies cannot reopen these financial tables. The
-- trigger and CHECK layers below also protect service_role, which bypasses RLS.
drop policy if exists "Stackr Gate 0 hides cash terms"
  on public.trade_cash_terms;
create policy "Stackr Gate 0 hides cash terms"
on public.trade_cash_terms
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "Stackr Gate 0 freezes legacy fulfilment"
  on public.trades;
create policy "Stackr Gate 0 freezes legacy fulfilment"
on public.trades
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "Stackr Gate 0 hides trade reviews"
  on public.trade_reviews;
create policy "Stackr Gate 0 hides trade reviews"
on public.trade_reviews
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "Stackr Gate 0 hides trader ratings"
  on public.trader_ratings;
create policy "Stackr Gate 0 hides trader ratings"
on public.trader_ratings
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

-- Every new card-only offer must originate from the authenticated sender and
-- bind to the receiver's currently active Conditional listing. The row trigger
-- below repeats this contract for RLS-bypass roles and serializes against
-- concurrent listing archival.
drop policy if exists "Stackr Gate 0 bound card offer inserts"
  on public.trade_offers;
create policy "Stackr Gate 0 bound card offer inserts"
on public.trade_offers
as restrictive
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and sender_id <> receiver_id
  and listing_id is not null
  and exists (
    select 1
    from public.user_card_flags as bound_listing
    where bound_listing.id = trade_offers.listing_id
      and bound_listing.user_id = trade_offers.receiver_id
      and bound_listing.flag_type = 'trade'
      and coalesce(bound_listing.listing_status, 'active') = 'active'
      and private.stackr_gate0_user_has_premium_seller(
        bound_listing.user_id
      )
  )
);

-- Active trade listings are a Conditional beta surface. Read current
-- server-owned Auth app_metadata through the hardened helper instead of trusting
-- a potentially stale signed JWT. Personal wishlist flags and archiving an
-- existing listing remain available to an unentitled owner.
drop policy if exists "Stackr Gate 0 current listing visibility"
  on public.user_card_flags;
create policy "Stackr Gate 0 current listing visibility"
on public.user_card_flags
as restrictive
for select
to anon, authenticated
using (
  not (
    flag_type = 'trade'
    and coalesce(listing_status, 'active') = 'active'
  )
  or private.stackr_gate0_user_has_premium_seller(user_id)
  or (select auth.uid()) = user_id
);

drop policy if exists "Stackr Gate 0 entitled listing inserts"
  on public.user_card_flags;
create policy "Stackr Gate 0 entitled listing inserts"
on public.user_card_flags
as restrictive
for insert
to authenticated
with check (
  not (
    flag_type = 'trade'
    and coalesce(listing_status, 'active') = 'active'
  )
  or private.stackr_gate0_user_has_premium_seller(user_id)
);

drop policy if exists "Stackr Gate 0 entitled listing updates"
  on public.user_card_flags;
create policy "Stackr Gate 0 entitled listing updates"
on public.user_card_flags
as restrictive
for update
to authenticated
using (true)
with check (
  not (
    flag_type = 'trade'
    and coalesce(listing_status, 'active') = 'active'
  )
  or private.stackr_gate0_user_has_premium_seller(user_id)
);

-- Seller inventory and sale bookkeeping remain a Conditional beta surface.
-- Preserve owner-private reads so a paused or expired seller can retrieve
-- their records, while every mutation also requires the current server-owned
-- Premium Seller entitlement. On staging this closes both direct
-- Data API writes and the SECURITY INVOKER batch RPC through RLS. Production's
-- guarded SECURITY DEFINER wrapper is also covered by the row triggers below.
do $seller_policies$
declare
  seller_table text;
begin
  foreach seller_table in array array[
    'seller_inventory_items',
    'inventory_movements',
    'seller_sale_transactions',
    'seller_sale_transaction_items'
  ] loop
    execute pg_catalog.format(
      'drop policy if exists %I on public.%I',
      'Stackr Gate 0 entitled seller inserts',
      seller_table
    );
    execute pg_catalog.format(
      $policy$
        create policy "Stackr Gate 0 entitled seller inserts"
        on public.%I
        as restrictive
        for insert
        to authenticated
        with check (
          private.stackr_gate0_user_has_premium_seller(user_id)
        )
      $policy$,
      seller_table
    );

    execute pg_catalog.format(
      'drop policy if exists %I on public.%I',
      'Stackr Gate 0 entitled seller updates',
      seller_table
    );
    execute pg_catalog.format(
      $policy$
        create policy "Stackr Gate 0 entitled seller updates"
        on public.%I
        as restrictive
        for update
        to authenticated
        using (
          private.stackr_gate0_user_has_premium_seller(user_id)
        )
        with check (
          private.stackr_gate0_user_has_premium_seller(user_id)
        )
      $policy$,
      seller_table
    );

    execute pg_catalog.format(
      'drop policy if exists %I on public.%I',
      'Stackr Gate 0 entitled seller deletes',
      seller_table
    );
    execute pg_catalog.format(
      $policy$
        create policy "Stackr Gate 0 entitled seller deletes"
        on public.%I
        as restrictive
        for delete
        to authenticated
        using (
          private.stackr_gate0_user_has_premium_seller(user_id)
        )
      $policy$,
      seller_table
    );
  end loop;
end;
$seller_policies$;

-- The staging SECURITY INVOKER batch function can otherwise accept an empty
-- no-op payload without touching any public seller table. Gate its receipt
-- insert too so every authenticated RPC invocation reaches an entitlement
-- boundary. Production writes this receipt through its already-entitled
-- SECURITY DEFINER wrapper and is unaffected by the authenticated policy.
drop policy if exists "Stackr Gate 0 entitled seller batch commits"
  on private.seller_inventory_batch_commits;
create policy "Stackr Gate 0 entitled seller batch commits"
on private.seller_inventory_batch_commits
as restrictive
for insert
to authenticated
with check (private.stackr_gate0_user_has_premium_seller(user_id));

-- The staging implementation checks idempotency by reading an existing batch
-- receipt before it writes. Gate that replay read on the current entitlement as
-- well, so a stale JWT cannot retrieve or replay a previously entitled batch.
drop policy if exists "Stackr Gate 0 entitled seller batch reads"
  on private.seller_inventory_batch_commits;
create policy "Stackr Gate 0 entitled seller batch reads"
on private.seller_inventory_batch_commits
as restrictive
for select
to authenticated
using (private.stackr_gate0_user_has_premium_seller(user_id));

-- RLS is not evaluated for service_role or table owners. Row triggers enforce
-- the same current entitlement at every seller mutation boundary, including
-- the staging invoker RPC receipt and production definer implementation.
do $seller_entitlement_triggers$
declare
  seller_relation text;
  trigger_name text;
begin
  foreach seller_relation in array array[
    'public.seller_inventory_items',
    'public.inventory_movements',
    'public.seller_sale_transactions',
    'public.seller_sale_transaction_items',
    'private.seller_inventory_batch_commits'
  ] loop
    trigger_name := 'stackr_gate0_guard_seller_entitlement';
    execute pg_catalog.format(
      'drop trigger if exists %I on %s',
      trigger_name,
      seller_relation
    );
    execute pg_catalog.format(
      'create trigger %I before insert or update or delete on %s for each row execute function public.stackr_gate0_guard_seller_entitlement()',
      trigger_name,
      seller_relation
    );
  end loop;
end;
$seller_entitlement_triggers$;

-- Remove inherited broad grants. The original implementation is moved behind
-- the postgres-owned wrapper below, so authenticated clients need SELECT only:
-- every mutation must pass the validated batch RPC. service_role retains DML
-- for backend recovery, with current-entitlement triggers as defense in depth.
do $seller_grants$
begin
  revoke all on table public.seller_inventory_items
    from public, anon, authenticated, service_role;
  revoke all on table public.inventory_movements
    from public, anon, authenticated, service_role;
  revoke all on table public.seller_sale_transactions
    from public, anon, authenticated, service_role;
  revoke all on table public.seller_sale_transaction_items
    from public, anon, authenticated, service_role;

  grant select on table public.seller_inventory_items
    to authenticated, service_role;
  grant select on table public.inventory_movements
    to authenticated, service_role;
  grant select on table public.seller_sale_transactions
    to authenticated, service_role;
  grant select on table public.seller_sale_transaction_items
    to authenticated, service_role;

  grant insert, update, delete on table public.seller_inventory_items
    to service_role;
  grant insert, update, delete on table public.inventory_movements
    to service_role;
  grant insert, update, delete on table public.seller_sale_transactions
    to service_role;
  grant insert, update, delete on table public.seller_sale_transaction_items
    to service_role;

  revoke all on sequence public.seller_sale_transaction_items_id_seq
    from public, anon, authenticated, service_role;
  grant usage, select on sequence public.seller_sale_transaction_items_id_seq
    to service_role;

  revoke all on table private.seller_inventory_batch_commits
    from public, anon, authenticated, service_role;
  grant select on table private.seller_inventory_batch_commits
    to authenticated, service_role;
  grant insert, update, delete on table private.seller_inventory_batch_commits
    to service_role;
end;
$seller_grants$;

-- Both ledgers expose the same seller RPC name but with different internals:
-- staging is SECURITY INVOKER, while production already has a guarded SECURITY
-- DEFINER wrapper. Move that exact implementation behind a private delegate and
-- install one common current-auth entitlement boundary in front of it. This
-- check runs before an idempotent replay can return an existing private receipt.
alter function public.commit_seller_inventory_batch(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) set schema private;
alter function private.commit_seller_inventory_batch(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) rename to commit_seller_inventory_batch_delegate;

revoke all on function private.commit_seller_inventory_batch_delegate(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;

create function public.commit_seller_inventory_batch(
  p_request_id text,
  p_expected_inventory jsonb,
  p_inventory jsonb,
  p_movements jsonb default '[]'::jsonb,
  p_sale jsonb default null,
  p_binder_deltas jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $seller_rpc$
declare
  seller_user_id uuid := (select auth.uid());
begin
  if seller_user_id is null then
    raise exception 'seller_inventory_authentication_required'
      using errcode = '42501';
  end if;

  if not private.stackr_gate0_user_has_premium_seller(seller_user_id) then
    raise exception 'gate0_conditional_surface_disabled: premium seller entitlement'
      using errcode = '42501';
  end if;

  return private.commit_seller_inventory_batch_delegate(
    p_request_id,
    p_expected_inventory,
    p_inventory,
    p_movements,
    p_sale,
    p_binder_deltas
  );
end;
$seller_rpc$;

alter function public.commit_seller_inventory_batch(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) owner to postgres;
revoke all on function public.commit_seller_inventory_batch(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.commit_seller_inventory_batch(
  text, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;

-- NOT VALID preserves historical rows while enforcing the rule for every new
-- insert or update.
alter table public.trade_cash_terms
  drop constraint if exists stackr_gate0_cash_terms_disabled;
alter table public.trade_cash_terms
  add constraint stackr_gate0_cash_terms_disabled check (false) not valid;

-- The legacy trades table only backed the retired sent/received HTTP routes.
-- Card-only beta trades use trade_offers, so the legacy fulfilment record is
-- frozen at the database boundary as well as at the API boundary.
alter table public.trades
  drop constraint if exists stackr_gate0_legacy_trade_fulfilment_disabled;
alter table public.trades
  add constraint stackr_gate0_legacy_trade_fulfilment_disabled
  check (false) not valid;

alter table public.trade_reviews
  drop constraint if exists stackr_gate0_trade_reviews_disabled;
alter table public.trade_reviews
  add constraint stackr_gate0_trade_reviews_disabled check (false) not valid;

alter table public.trader_ratings
  drop constraint if exists stackr_gate0_trader_ratings_disabled;
alter table public.trader_ratings
  add constraint stackr_gate0_trader_ratings_disabled check (false) not valid;

alter table public.trade_offer_events
  drop constraint if exists stackr_gate0_financial_events_disabled;
alter table public.trade_offer_events
  add constraint stackr_gate0_financial_events_disabled check (
    proposed_cash_amount is null
    and event_type not in ('payment_required', 'payment_sent', 'payment_confirmed')
    and (
      proposed_status is null
      or proposed_status not in ('payment_required', 'payment_sent', 'payment_confirmed')
    )
  ) not valid;

alter table public.trade_offer_events
  drop constraint if exists stackr_gate0_fulfilment_events_disabled;
alter table public.trade_offer_events
  add constraint stackr_gate0_fulfilment_events_disabled check (
    event_type is not null
    and event_type in (
      'offer_created',
      'message',
      'counter_offer',
      'pending',
      'accepted',
      'declined',
      'cancelled',
      'disputed'
    )
    and (
      proposed_status is null
      or proposed_status in (
        'pending',
        'accepted',
        'declined',
        'cancelled',
        'disputed'
      )
    )
  ) not valid;

alter table public.trade_offers
  drop constraint if exists stackr_gate0_offer_listing_binding_required;
alter table public.trade_offers
  add constraint stackr_gate0_offer_listing_binding_required check (
    listing_id is not null
    and sender_id <> receiver_id
  ) not valid;

alter table public.trade_offers
  drop constraint if exists stackr_gate0_payment_statuses_disabled;
alter table public.trade_offers
  add constraint stackr_gate0_payment_statuses_disabled check (
    status not in ('payment_required', 'payment_sent', 'payment_confirmed')
  ) not valid;

alter table public.trade_offers
  drop constraint if exists stackr_gate0_fulfilment_states_disabled;
alter table public.trade_offers
  add constraint stackr_gate0_fulfilment_states_disabled check (
    status is not null
    and status in ('pending', 'accepted', 'declined', 'cancelled', 'disputed')
    and sender_sent is false
    and receiver_sent is false
    and sender_received is false
    and receiver_received is false
    and completed_at is null
  ) not valid;

alter table public.user_card_flags
  drop constraint if exists stackr_gate0_listing_payment_binding_disabled;
alter table public.user_card_flags
  add constraint stackr_gate0_listing_payment_binding_disabled
  check (payment_intent_id is null) not valid;

alter table public.user_card_flags
  drop constraint if exists stackr_gate0_listing_sold_state_disabled;
alter table public.user_card_flags
  add constraint stackr_gate0_listing_sold_state_disabled
  check (listing_status is null or listing_status <> 'sold') not valid;

drop trigger if exists stackr_gate0_block_cash_terms on public.trade_cash_terms;
create trigger stackr_gate0_block_cash_terms
before insert or update or delete on public.trade_cash_terms
for each row execute function public.stackr_gate0_block_financial_write();

drop trigger if exists stackr_gate0_block_legacy_trade_fulfilment
  on public.trades;
create trigger stackr_gate0_block_legacy_trade_fulfilment
before insert or update or delete on public.trades
for each row execute function public.stackr_gate0_block_legacy_fulfilment_write();

drop trigger if exists stackr_gate0_block_trade_reviews
  on public.trade_reviews;
create trigger stackr_gate0_block_trade_reviews
before insert or update or delete on public.trade_reviews
for each row execute function public.stackr_gate0_block_legacy_fulfilment_write();

drop trigger if exists stackr_gate0_block_trader_ratings
  on public.trader_ratings;
create trigger stackr_gate0_block_trader_ratings
before insert or update or delete on public.trader_ratings
for each row execute function public.stackr_gate0_block_legacy_fulfilment_write();

drop trigger if exists stackr_gate0_guard_trade_offer_financial_state
  on public.trade_offers;
create trigger stackr_gate0_guard_trade_offer_financial_state
before insert or update or delete on public.trade_offers
for each row execute function public.stackr_gate0_guard_trade_offer_financial_state();

drop trigger if exists stackr_gate0_guard_trade_event_financial_state
  on public.trade_offer_events;
create trigger stackr_gate0_guard_trade_event_financial_state
before insert or update or delete on public.trade_offer_events
for each row execute function public.stackr_gate0_guard_trade_event_financial_state();

drop trigger if exists stackr_gate0_guard_trade_offer_card_membership
  on public.trade_offer_cards;
create trigger stackr_gate0_guard_trade_offer_card_membership
before insert or update or delete on public.trade_offer_cards
for each row execute function public.stackr_gate0_guard_trade_offer_card_membership();

drop trigger if exists stackr_gate0_guard_listing_financial_state
  on public.user_card_flags;
create trigger stackr_gate0_guard_listing_financial_state
before insert or update or delete on public.user_card_flags
for each row execute function public.stackr_gate0_guard_listing_financial_state();

-- Existing active listings are preserved but cannot remain publicly active
-- without the server-authored seller entitlement. Archive them in place; an
-- owner can republish only after app_metadata grants the Conditional cohort.
do $archive_unentitled_listings$
declare
  archived_count integer;
begin
  update public.user_card_flags as listing
  set
    listing_status = 'archived',
    updated_at = pg_catalog.now()
  where listing.flag_type = 'trade'
    and coalesce(listing.listing_status, 'active') = 'active'
    and not private.stackr_gate0_user_has_premium_seller(listing.user_id);

  get diagnostics archived_count = row_count;
  raise notice 'stackr_gate0_archived_unentitled_listings:%', archived_count;
end;
$archive_unentitled_listings$;

drop trigger if exists stackr_gate0_guard_profile_financial_binding
  on public.profiles;
create trigger stackr_gate0_guard_profile_financial_binding
before insert or update on public.profiles
for each row execute function public.stackr_gate0_guard_profile_financial_binding();

-- Cash terms are invisible and immutable to every API role. Historical values
-- remain available only to the database owner for reconciliation.
revoke all on table public.trade_cash_terms
  from public, anon, authenticated, service_role;

-- No API role, including service_role, can recreate the legacy shipping-state
-- mutations after the HTTP handlers have been retired.
revoke all on table public.trades
  from public, anon, authenticated, service_role;

-- Post-fulfilment reviews/ratings are a hidden launch surface. No API role can
-- read or mutate these lifecycle records until fulfilment itself is released.
revoke all on table public.trade_reviews
  from public, anon, authenticated, service_role;
revoke all on table public.trader_ratings
  from public, anon, authenticated, service_role;

-- Card-only trade stays available to signed-in participants. Existing RLS
-- policies continue to enforce participant ownership. Rebuild both client and
-- service-role writes from explicit safe columns: a table-level INSERT or
-- UPDATE would override column revokes and reopen the fulfilment booleans.
do $trade_offer_grants$
declare
  safe_insert_columns text;
  safe_update_columns text;
begin
  select pg_catalog.string_agg(
    pg_catalog.quote_ident(attribute.attname),
    ', ' order by attribute.attnum
  )
  into safe_insert_columns
  from pg_catalog.pg_attribute as attribute
  where attribute.attrelid = 'public.trade_offers'::pg_catalog.regclass
    and attribute.attnum > 0
    and not attribute.attisdropped
    and attribute.attname not in (
      'sender_sent',
      'receiver_sent',
      'sender_received',
      'receiver_received',
      'completed_at'
    );

  select pg_catalog.string_agg(
    pg_catalog.quote_ident(attribute.attname),
    ', ' order by attribute.attnum
  )
  into safe_update_columns
  from pg_catalog.pg_attribute as attribute
  where attribute.attrelid = 'public.trade_offers'::pg_catalog.regclass
    and attribute.attnum > 0
    and not attribute.attisdropped
    and attribute.attname in (
      'status',
      'message',
      'updated_at',
      'accepted_at',
      'declined_at'
    );

  if safe_insert_columns is null or safe_update_columns is null then
    raise exception 'stackr_gate0_safe_trade_offer_columns_missing';
  end if;

  revoke all on table public.trade_offers
    from public, anon, authenticated, service_role;
  revoke insert (
    sender_sent,
    receiver_sent,
    sender_received,
    receiver_received,
    completed_at
  ), update (
    sender_sent,
    receiver_sent,
    sender_received,
    receiver_received,
    completed_at
  ) on table public.trade_offers
    from public, anon, authenticated, service_role;

  grant select on table public.trade_offers to authenticated, service_role;
  execute pg_catalog.format(
    'grant insert (%s) on table public.trade_offers to authenticated, service_role',
    safe_insert_columns
  );
  execute pg_catalog.format(
    'grant update (%s) on table public.trade_offers to authenticated, service_role',
    safe_update_columns
  );
end;
$trade_offer_grants$;

revoke all on table public.trade_offer_cards
  from public, anon, authenticated, service_role;
grant select, insert on table public.trade_offer_cards
  to authenticated, service_role;

-- A sender may add currently owned offered cards plus the receiver's one exact
-- requested listing card. The trigger repeats this contract for service_role,
-- serializes the ownership check, and makes every accepted row immutable.
drop policy if exists "Stackr Gate 0 participant cards only"
  on public.trade_offer_cards;
create policy "Stackr Gate 0 participant cards only"
on public.trade_offer_cards
as restrictive
for insert
to authenticated
with check (
  exists (
    select 1
    from public.trade_offers as offer
    join public.user_card_flags as listing
      on listing.id = offer.listing_id
      and listing.user_id = offer.receiver_id
      and listing.flag_type = 'trade'
    where offer.id = trade_offer_cards.offer_id
      and offer.sender_id = (select auth.uid())
      and (
        (
          trade_offer_cards.owner_id = offer.receiver_id
          and trade_offer_cards.card_id = listing.card_id
          and trade_offer_cards.set_id is not distinct from listing.set_id
        )
        or (
          trade_offer_cards.owner_id = offer.sender_id
          and exists (
            select 1
            from public.user_card_variants as owned_variant
            where owned_variant.user_id = offer.sender_id
              and owned_variant.card_id = trade_offer_cards.card_id
              and owned_variant.set_id = trade_offer_cards.set_id
              and owned_variant.quantity > 0
          )
        )
      )
  )
);

revoke all on table public.trade_offer_events
  from public, anon, authenticated, service_role;
grant select, insert on table public.trade_offer_events
  to authenticated, service_role;

-- Public listing reads remain available, but no API role can set or change a
-- payment intent. Build the grants from the real schema so this remains valid
-- across the production and staging ledgers.
do $block$
declare
  safe_listing_columns text;
begin
  select pg_catalog.string_agg(
    pg_catalog.quote_ident(attribute.attname),
    ', ' order by attribute.attnum
  )
  into safe_listing_columns
  from pg_catalog.pg_attribute as attribute
  where attribute.attrelid = 'public.user_card_flags'::pg_catalog.regclass
    and attribute.attnum > 0
    and not attribute.attisdropped
    and attribute.attname <> 'payment_intent_id';

  if safe_listing_columns is null then
    raise exception 'stackr_gate0_safe_listing_columns_missing';
  end if;

  revoke all on table public.user_card_flags
    from public, anon, authenticated, service_role;
  revoke insert (payment_intent_id), update (payment_intent_id)
    on table public.user_card_flags
    from public, anon, authenticated, service_role;
  grant select on table public.user_card_flags to anon, authenticated, service_role;
  grant delete on table public.user_card_flags to authenticated, service_role;
  execute pg_catalog.format(
    'grant insert (%s) on table public.user_card_flags to authenticated, service_role',
    safe_listing_columns
  );
  execute pg_catalog.format(
    'grant update (%s) on table public.user_card_flags to authenticated, service_role',
    safe_listing_columns
  );
end;
$block$;

-- Restore the private-profile boundary on both ledgers. Public profile reads use
-- profile_public_directory; clients cannot author email, role, or Stripe IDs.
revoke all on table public.profiles from public, anon, authenticated, service_role;
revoke insert (stripe_account_id), update (stripe_account_id)
  on table public.profiles
  from public, anon, authenticated, service_role;
grant select on table public.profiles to authenticated, service_role;
grant delete on table public.profiles to service_role;
grant insert (
  id,
  collector_name,
  avatar_url,
  avatar_preset,
  banner_url,
  pokemon_type,
  background_key,
  profile_banner_cosmetic_id,
  profile_border_cosmetic_id,
  favorite_card_id,
  favorite_set_id,
  chase_card_id,
  chase_set_id,
  has_seen_onboarding,
  expo_push_token
) on table public.profiles to authenticated;
grant update (
  collector_name,
  avatar_url,
  avatar_preset,
  banner_url,
  pokemon_type,
  background_key,
  profile_banner_cosmetic_id,
  profile_border_cosmetic_id,
  favorite_card_id,
  favorite_set_id,
  chase_card_id,
  chase_set_id,
  has_seen_onboarding,
  expo_push_token
) on table public.profiles to authenticated;

do $block$
declare
  safe_profile_columns text;
begin
  select pg_catalog.string_agg(
    pg_catalog.quote_ident(attribute.attname),
    ', ' order by attribute.attnum
  )
  into safe_profile_columns
  from pg_catalog.pg_attribute as attribute
  where attribute.attrelid = 'public.profiles'::pg_catalog.regclass
    and attribute.attnum > 0
    and not attribute.attisdropped
    and attribute.attname <> 'stripe_account_id';

  if safe_profile_columns is null then
    raise exception 'stackr_gate0_safe_profile_columns_missing';
  end if;

  execute pg_catalog.format(
    'grant insert (%s) on table public.profiles to service_role',
    safe_profile_columns
  );
  execute pg_catalog.format(
    'grant update (%s) on table public.profiles to service_role',
    safe_profile_columns
  );
end;
$block$;

-- The staging-only family purchase experiment is a financial surface. Keep the
-- migration valid on production, where these objects do not exist.
do $block$
begin
  if pg_catalog.to_regclass('public.family_purchase_requests') is not null then
    execute 'alter table public.family_purchase_requests enable row level security';
    execute 'alter table public.family_purchase_requests drop constraint if exists stackr_gate0_family_purchases_disabled';
    execute 'alter table public.family_purchase_requests add constraint stackr_gate0_family_purchases_disabled check (false) not valid';
    execute 'drop trigger if exists stackr_gate0_block_family_purchases on public.family_purchase_requests';
    execute 'create trigger stackr_gate0_block_family_purchases before insert or update or delete on public.family_purchase_requests for each row execute function public.stackr_gate0_block_financial_write()';
    execute 'revoke all on table public.family_purchase_requests from public, anon, authenticated, service_role';
    execute 'drop policy if exists "Stackr Gate 0 hides purchase requests" on public.family_purchase_requests';
    execute 'create policy "Stackr Gate 0 hides purchase requests" on public.family_purchase_requests as restrictive for all to anon, authenticated using (false) with check (false)';
  end if;

  if pg_catalog.to_regprocedure(
    'public.create_family_purchase_request(uuid,uuid)'
  ) is not null then
    execute 'revoke all on function public.create_family_purchase_request(uuid,uuid) from public, anon, authenticated, service_role';
  end if;

  if pg_catalog.to_regprocedure(
    'public.respond_family_purchase_request(uuid,text)'
  ) is not null then
    execute 'revoke all on function public.respond_family_purchase_request(uuid,text) from public, anon, authenticated, service_role';
  end if;

  if pg_catalog.to_regprocedure('public.accept_trade_offer(uuid)') is not null then
    execute 'revoke all on function public.accept_trade_offer(uuid) from public, anon, authenticated, service_role';
  end if;

  -- This RPC records seller inventory bookkeeping only. It is not an order,
  -- payment, shipping-label or provider-execution route and remains a
  -- Conditional seller-beta surface outside the Gate 0 commerce boundary.
  if pg_catalog.to_regprocedure(
    'public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)'
  ) is not null then
    execute 'revoke all on function public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon';
    execute $comment$
      comment on function public.commit_seller_inventory_batch(
        text,jsonb,jsonb,jsonb,jsonb,jsonb
      ) is
      'Conditional seller-beta inventory bookkeeping only; does not create an order, payment, shipping label or provider call.'
    $comment$;
  end if;
end;
$block$;

-- The staging-only trade_listings experiment has no application consumer and
-- exposes a second public/price-bearing listing surface. Freeze it entirely;
-- the production ledger has no such table, so keep the migration portable.
do $legacy_trade_listings$
begin
  if pg_catalog.to_regclass('public.trade_listings') is not null then
    execute 'alter table public.trade_listings enable row level security';
    execute 'alter table public.trade_listings drop constraint if exists stackr_gate0_legacy_trade_listings_disabled';
    execute 'alter table public.trade_listings add constraint stackr_gate0_legacy_trade_listings_disabled check (false) not valid';
    execute 'drop trigger if exists stackr_gate0_block_legacy_trade_listings on public.trade_listings';
    execute 'create trigger stackr_gate0_block_legacy_trade_listings before insert or update or delete on public.trade_listings for each row execute function public.stackr_gate0_block_financial_write()';
    execute 'revoke all on table public.trade_listings from public, anon, authenticated, service_role';
    execute 'drop policy if exists "Stackr Gate 0 hides legacy trade listings" on public.trade_listings';
    execute 'create policy "Stackr Gate 0 hides legacy trade listings" on public.trade_listings as restrictive for all to anon, authenticated using (false) with check (false)';
    execute $comment$
      comment on table public.trade_listings is
      'Gate 0 frozen legacy listing experiment. user_card_flags is the Conditional listing surface.'
    $comment$;
  end if;

  if pg_catalog.to_regclass('public.marketplace_listings') is not null then
    execute 'alter table public.marketplace_listings enable row level security';
    execute 'alter table public.marketplace_listings drop constraint if exists stackr_gate0_legacy_marketplace_listings_disabled';
    execute 'alter table public.marketplace_listings add constraint stackr_gate0_legacy_marketplace_listings_disabled check (false) not valid';
    execute 'drop trigger if exists stackr_gate0_block_legacy_marketplace_listings on public.marketplace_listings';
    execute 'create trigger stackr_gate0_block_legacy_marketplace_listings before insert or update or delete on public.marketplace_listings for each row execute function public.stackr_gate0_block_financial_write()';
    execute 'revoke all on table public.marketplace_listings from public, anon, authenticated, service_role';
    execute 'drop policy if exists "Stackr Gate 0 hides legacy marketplace listings" on public.marketplace_listings';
    execute 'create policy "Stackr Gate 0 hides legacy marketplace listings" on public.marketplace_listings as restrictive for all to anon, authenticated using (false) with check (false)';
    execute $comment$
      comment on table public.marketplace_listings is
      'Gate 0 frozen legacy marketplace experiment. user_card_flags is the Conditional listing surface.'
    $comment$;
  end if;
end;
$legacy_trade_listings$;

-- Remove implicit or historical client execution from every current function
-- in the protected schemas, then rebuild the exact proven runtime matrix.
-- Trigger entrypoints require no client EXECUTE privilege. Financial/order
-- RPCs intentionally receive no grant.
revoke all on all functions in schema public
  from public, anon, authenticated, service_role;
revoke all on all functions in schema private
  from public, anon, authenticated, service_role;

do $function_execute_allowlist$
declare
  grant_spec record;
begin
  for grant_spec in
    select *
    from (values
      ('public.admin_binder_directory()', 'authenticated, service_role'),
      ('public.archive_family_child_profile(uuid)', 'authenticated'),
      ('public.create_family_child_profile(text,text,boolean)', 'authenticated'),
      ('public.get_active_scanner_threshold_set()', 'authenticated, service_role'),
      ('public.is_admin()', 'anon, authenticated, service_role'),
      ('public.is_recognition_feedback_reviewer()', 'authenticated, service_role'),
      ('public.is_scan_lab_admin()', 'authenticated, service_role'),
      ('public.purchase_cosmetic(text)', 'authenticated, service_role'),
      ('public.recalculate_binder_values(uuid)', 'authenticated, service_role'),
      ('public.update_binder_card_prices()', 'service_role'),
      ('public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)', 'authenticated'),
      ('private.stackr_gate0_user_has_premium_seller(uuid)', 'anon, authenticated, service_role'),
      ('private.stackr_gate0_card_trade_dispute_allowed(uuid,uuid)', 'authenticated')
    ) as allowed_function(signature, grantees)
  loop
    if pg_catalog.to_regprocedure(grant_spec.signature) is not null then
      execute pg_catalog.format(
        'grant execute on function %s to %s',
        grant_spec.signature,
        grant_spec.grantees
      );
    end if;
  end loop;
end;
$function_execute_allowlist$;

-- New protected-schema objects become opt-in instead of inheriting broad Data
-- API grants. Derive the owner set from actual public/private objects plus the
-- migration executor. If this session cannot alter one of those roles, the
-- unconditional assertions below fail closed rather than treating a missing
-- default ACL row as safe.
do $default_privileges$
declare
  required_owner text;
begin
  for required_owner in
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
  loop
    if pg_catalog.pg_has_role(current_user, required_owner, 'MEMBER') then
      execute pg_catalog.format(
        'alter default privileges for role %I revoke execute on functions from public',
        required_owner
      );
      execute pg_catalog.format(
        'alter default privileges for role %I in schema public revoke all on tables from anon, authenticated, service_role',
        required_owner
      );
      execute pg_catalog.format(
        'alter default privileges for role %I in schema public revoke all on sequences from anon, authenticated, service_role',
        required_owner
      );
      execute pg_catalog.format(
        'alter default privileges for role %I in schema public revoke all on functions from public, anon, authenticated, service_role',
        required_owner
      );
      execute pg_catalog.format(
        'alter default privileges for role %I in schema private revoke all on functions from public, anon, authenticated, service_role',
        required_owner
      );
      execute pg_catalog.format(
        'alter default privileges for role %I in schema private revoke all on tables from anon, authenticated, service_role',
        required_owner
      );
      execute pg_catalog.format(
        'alter default privileges for role %I in schema private revoke all on sequences from anon, authenticated, service_role',
        required_owner
      );
    end if;
  end loop;
end;
$default_privileges$;

-- Fail the migration if any financial write path above is still available.
do $assertions$
declare
  forbidden_count bigint;
begin
  if not exists (
    select 1
    from pg_catalog.pg_proc as helper
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = helper.proowner
    where helper.oid = pg_catalog.to_regprocedure(
      'private.stackr_gate0_user_has_premium_seller(uuid)'
    )
      and helper.prosecdef
      and helper.proconfig @> array['search_path=""']
      and owner_role.rolname = 'postgres'
      and pg_catalog.pg_get_functiondef(helper.oid)
        like '%auth.users%raw_app_meta_data%stackr_premium_seller%'
      and pg_catalog.pg_get_functiondef(helper.oid)
        not like '%raw_user_meta_data%'
      and not exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(
            helper.proacl,
            pg_catalog.acldefault('f', helper.proowner)
          )
        ) as privilege
        where privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
      )
      and pg_catalog.has_function_privilege(
        'anon', helper.oid, 'EXECUTE'
      )
      and pg_catalog.has_function_privilege(
        'authenticated', helper.oid, 'EXECUTE'
      )
      and pg_catalog.has_function_privilege(
        'service_role', helper.oid, 'EXECUTE'
      )
  ) then
    raise exception 'stackr_gate0_current_entitlement_helper_assertion_failed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as helper
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = helper.proowner
    where helper.oid = pg_catalog.to_regprocedure(
      'private.stackr_gate0_card_trade_dispute_allowed(uuid,uuid)'
    )
      and helper.prosecdef
      and helper.proconfig @> array['search_path=""']
      and owner_role.rolname = 'postgres'
      and pg_catalog.pg_get_functiondef(helper.oid)
        like '%trade_offer_cards%trade_cash_terms%'
      and not exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(
            helper.proacl,
            pg_catalog.acldefault('f', helper.proowner)
          )
        ) as privilege
        where privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'anon', helper.oid, 'EXECUTE'
      )
      and pg_catalog.has_function_privilege(
        'authenticated', helper.oid, 'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'service_role', helper.oid, 'EXECUTE'
      )
  ) then
    raise exception 'stackr_gate0_card_trade_dispute_helper_assertion_failed';
  end if;

  -- Every mutation trigger is exactly one ordinary, enabled BEFORE ROW trigger
  -- with the complete intended event mask. Optional legacy tables are checked
  -- whenever they exist on the target ledger.
  if exists (
    with expected_trigger(
      schema_name,
      table_name,
      trigger_name,
      function_signature,
      trigger_type
    ) as (
      values
        ('public', 'trade_cash_terms', 'stackr_gate0_block_cash_terms', 'public.stackr_gate0_block_financial_write()', 31),
        ('public', 'trades', 'stackr_gate0_block_legacy_trade_fulfilment', 'public.stackr_gate0_block_legacy_fulfilment_write()', 31),
        ('public', 'trade_reviews', 'stackr_gate0_block_trade_reviews', 'public.stackr_gate0_block_legacy_fulfilment_write()', 31),
        ('public', 'trader_ratings', 'stackr_gate0_block_trader_ratings', 'public.stackr_gate0_block_legacy_fulfilment_write()', 31),
        ('public', 'trade_offers', 'stackr_gate0_guard_trade_offer_financial_state', 'public.stackr_gate0_guard_trade_offer_financial_state()', 31),
        ('public', 'trade_offer_events', 'stackr_gate0_guard_trade_event_financial_state', 'public.stackr_gate0_guard_trade_event_financial_state()', 31),
        ('public', 'trade_offer_cards', 'stackr_gate0_guard_trade_offer_card_membership', 'public.stackr_gate0_guard_trade_offer_card_membership()', 31),
        ('public', 'user_card_flags', 'stackr_gate0_guard_listing_financial_state', 'public.stackr_gate0_guard_listing_financial_state()', 31),
        ('public', 'profiles', 'stackr_gate0_guard_profile_financial_binding', 'public.stackr_gate0_guard_profile_financial_binding()', 23),
        ('public', 'family_purchase_requests', 'stackr_gate0_block_family_purchases', 'public.stackr_gate0_block_financial_write()', 31),
        ('public', 'trade_listings', 'stackr_gate0_block_legacy_trade_listings', 'public.stackr_gate0_block_financial_write()', 31),
        ('public', 'marketplace_listings', 'stackr_gate0_block_legacy_marketplace_listings', 'public.stackr_gate0_block_financial_write()', 31),
        ('public', 'seller_inventory_items', 'stackr_gate0_guard_seller_entitlement', 'public.stackr_gate0_guard_seller_entitlement()', 31),
        ('public', 'inventory_movements', 'stackr_gate0_guard_seller_entitlement', 'public.stackr_gate0_guard_seller_entitlement()', 31),
        ('public', 'seller_sale_transactions', 'stackr_gate0_guard_seller_entitlement', 'public.stackr_gate0_guard_seller_entitlement()', 31),
        ('public', 'seller_sale_transaction_items', 'stackr_gate0_guard_seller_entitlement', 'public.stackr_gate0_guard_seller_entitlement()', 31),
        ('private', 'seller_inventory_batch_commits', 'stackr_gate0_guard_seller_entitlement', 'public.stackr_gate0_guard_seller_entitlement()', 31)
    )
    select 1
    from expected_trigger
    where pg_catalog.to_regclass(pg_catalog.format(
      '%I.%I', expected_trigger.schema_name, expected_trigger.table_name
    )) is not null
      and (
        select count(*)
        from pg_catalog.pg_trigger as trigger_record
        join pg_catalog.pg_class as relation
          on relation.oid = trigger_record.tgrelid
        join pg_catalog.pg_namespace as relation_schema
          on relation_schema.oid = relation.relnamespace
        where not trigger_record.tgisinternal
          and relation_schema.nspname = expected_trigger.schema_name
          and relation.relname = expected_trigger.table_name
          and trigger_record.tgname = expected_trigger.trigger_name
          and trigger_record.tgenabled = 'O'
          and trigger_record.tgtype = expected_trigger.trigger_type
          and trigger_record.tgfoid = pg_catalog.to_regprocedure(
            expected_trigger.function_signature
          )
      ) <> 1
  ) then
    raise exception 'stackr_gate0_exact_mutation_trigger_assertion_failed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy as policy_record
    join pg_catalog.pg_class as relation
      on relation.oid = policy_record.polrelid
    join pg_catalog.pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    where relation_schema.nspname = 'public'
      and relation.relname = 'trade_offers'
      and policy_record.polname = 'Stackr Gate 0 bound card offer inserts'
      and not policy_record.polpermissive
      and policy_record.polcmd = 'a'
      and policy_record.polqual is null
      and pg_catalog.cardinality(policy_record.polroles) = 1
      and policy_record.polroles @> array[
        (select role_record.oid
         from pg_catalog.pg_roles as role_record
         where role_record.rolname = 'authenticated')
      ]
      and pg_catalog.pg_get_expr(
        policy_record.polwithcheck,
        policy_record.polrelid
      ) like '%auth.uid%sender_id%receiver_id%listing_id%'
      and pg_catalog.pg_get_expr(
        policy_record.polwithcheck,
        policy_record.polrelid
      ) like '%flag_type%listing_status%stackr_gate0_user_has_premium_seller%'
      and pg_catalog.pg_get_expr(
        policy_record.polwithcheck,
        policy_record.polrelid
      ) not like '%auth.jwt%'
  ) then
    raise exception 'stackr_gate0_bound_offer_policy_assertion_failed';
  end if;

  if exists (
    with hidden_lifecycle(table_name, policy_name, constraint_name) as (
      values
        ('trade_reviews', 'Stackr Gate 0 hides trade reviews', 'stackr_gate0_trade_reviews_disabled'),
        ('trader_ratings', 'Stackr Gate 0 hides trader ratings', 'stackr_gate0_trader_ratings_disabled')
    )
    select 1
    from hidden_lifecycle
    where not exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as relation_schema
        on relation_schema.oid = relation.relnamespace
      where relation_schema.nspname = 'public'
        and relation.relname = hidden_lifecycle.table_name
        and relation.relrowsecurity
    )
      or not exists (
        select 1
        from pg_catalog.pg_policy as policy_record
        join pg_catalog.pg_class as relation
          on relation.oid = policy_record.polrelid
        join pg_catalog.pg_namespace as relation_schema
          on relation_schema.oid = relation.relnamespace
        where relation_schema.nspname = 'public'
          and relation.relname = hidden_lifecycle.table_name
          and policy_record.polname = hidden_lifecycle.policy_name
          and not policy_record.polpermissive
          and policy_record.polcmd = '*'
          and pg_catalog.cardinality(policy_record.polroles) = 2
          and policy_record.polroles @> array[
            (select role_record.oid
             from pg_catalog.pg_roles as role_record
             where role_record.rolname = 'anon'),
            (select role_record.oid
             from pg_catalog.pg_roles as role_record
             where role_record.rolname = 'authenticated')
          ]
          and pg_catalog.pg_get_expr(
            policy_record.polqual,
            policy_record.polrelid
          ) = 'false'
          and pg_catalog.pg_get_expr(
            policy_record.polwithcheck,
            policy_record.polrelid
          ) = 'false'
      )
      or not exists (
        select 1
        from pg_catalog.pg_constraint as constraint_record
        join pg_catalog.pg_class as relation
          on relation.oid = constraint_record.conrelid
        join pg_catalog.pg_namespace as relation_schema
          on relation_schema.oid = relation.relnamespace
        where relation_schema.nspname = 'public'
          and relation.relname = hidden_lifecycle.table_name
          and constraint_record.conname = hidden_lifecycle.constraint_name
          and constraint_record.contype = 'c'
          and not constraint_record.convalidated
          and lower(pg_catalog.pg_get_constraintdef(
            constraint_record.oid,
            true
          )) = 'check (false) not valid'
      )
  ) then
    raise exception 'stackr_gate0_hidden_lifecycle_catalog_assertion_failed';
  end if;

  if exists (
    select 1
    from (values ('trade_reviews'), ('trader_ratings'))
      as hidden_lifecycle(table_name)
    cross join (values ('anon'), ('authenticated'), ('service_role'))
      as api_role(role_name)
    cross join (values
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
      ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
    ) as checked_privilege(privilege_name)
    where pg_catalog.has_table_privilege(
      api_role.role_name,
      pg_catalog.format('public.%I', hidden_lifecycle.table_name),
      checked_privilege.privilege_name
    )
  ) then
    raise exception 'stackr_gate0_hidden_lifecycle_privilege_assertion_failed';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_policy as policy_record
    join pg_catalog.pg_class as relation
      on relation.oid = policy_record.polrelid
    join pg_catalog.pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    where relation_schema.nspname = 'public'
      and relation.relname = 'user_card_flags'
      and policy_record.polname in (
        'Stackr Gate 0 current listing visibility',
        'Stackr Gate 0 entitled listing inserts',
        'Stackr Gate 0 entitled listing updates'
      )
      and not policy_record.polpermissive
      and policy_record.polcmd in ('r', 'a', 'w')
      and (
        coalesce(
          pg_catalog.pg_get_expr(
            policy_record.polqual,
            policy_record.polrelid
          ),
          ''
        )
        || coalesce(
          pg_catalog.pg_get_expr(
            policy_record.polwithcheck,
            policy_record.polrelid
          ),
          ''
        )
      ) like '%stackr_gate0_user_has_premium_seller%'
      and (
        coalesce(
          pg_catalog.pg_get_expr(
            policy_record.polqual,
            policy_record.polrelid
          ),
          ''
        )
        || coalesce(
          pg_catalog.pg_get_expr(
            policy_record.polwithcheck,
            policy_record.polrelid
          ),
          ''
        )
      ) not like '%auth.jwt%'
  ) <> 3 then
    raise exception 'stackr_gate0_listing_entitlement_policy_assertion_failed';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_policy as policy_record
    join pg_catalog.pg_class as relation
      on relation.oid = policy_record.polrelid
    join pg_catalog.pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    where relation_schema.nspname = 'public'
      and relation.relname in (
        'seller_inventory_items',
        'inventory_movements',
        'seller_sale_transactions',
        'seller_sale_transaction_items'
      )
      and policy_record.polname in (
        'Stackr Gate 0 entitled seller inserts',
        'Stackr Gate 0 entitled seller updates',
        'Stackr Gate 0 entitled seller deletes'
      )
      and not policy_record.polpermissive
      and policy_record.polcmd in ('a', 'w', 'd')
      and policy_record.polroles @> array[
        (select role_record.oid
         from pg_catalog.pg_roles as role_record
         where role_record.rolname = 'authenticated')
      ]
      and (
        coalesce(
          pg_catalog.pg_get_expr(
            policy_record.polqual,
            policy_record.polrelid
          ),
          ''
        )
        || coalesce(
          pg_catalog.pg_get_expr(
            policy_record.polwithcheck,
            policy_record.polrelid
          ),
          ''
        )
      ) like '%stackr_gate0_user_has_premium_seller%'
      and (
        coalesce(
          pg_catalog.pg_get_expr(
            policy_record.polqual,
            policy_record.polrelid
          ),
          ''
        )
        || coalesce(
          pg_catalog.pg_get_expr(
            policy_record.polwithcheck,
            policy_record.polrelid
          ),
          ''
        )
      ) not like '%auth.jwt%'
  ) <> 12 then
    raise exception 'stackr_gate0_seller_entitlement_policy_assertion_failed';
  end if;

  if exists (
    select 1
    from unnest(array[
      'seller_inventory_items',
      'inventory_movements',
      'seller_sale_transactions',
      'seller_sale_transaction_items'
    ]) as seller_table(table_name)
    where pg_catalog.has_table_privilege(
      'anon',
      pg_catalog.format('public.%I', seller_table.table_name),
      'SELECT'
    )
      or pg_catalog.has_table_privilege(
        'anon',
        pg_catalog.format('public.%I', seller_table.table_name),
        'INSERT'
      )
      or pg_catalog.has_table_privilege(
        'anon',
        pg_catalog.format('public.%I', seller_table.table_name),
        'UPDATE'
      )
      or pg_catalog.has_table_privilege(
        'anon',
        pg_catalog.format('public.%I', seller_table.table_name),
        'DELETE'
      )
  ) then
    raise exception 'stackr_gate0_anon_seller_privilege_assertion_failed';
  end if;

  if exists (
    select 1
    from unnest(array[
      'seller_inventory_items',
      'inventory_movements',
      'seller_sale_transactions',
      'seller_sale_transaction_items'
    ]) as seller_table(table_name)
    cross join (values
      ('authenticated', 'SELECT', true),
      ('authenticated', 'INSERT', false),
      ('authenticated', 'UPDATE', false),
      ('authenticated', 'DELETE', false),
      ('service_role', 'SELECT', true),
      ('service_role', 'INSERT', true),
      ('service_role', 'UPDATE', true),
      ('service_role', 'DELETE', true)
    ) as expected_grant(role_name, privilege_name, allowed)
    where pg_catalog.has_table_privilege(
      expected_grant.role_name,
      pg_catalog.format('public.%I', seller_table.table_name),
      expected_grant.privilege_name
    ) is distinct from expected_grant.allowed
  ) then
    raise exception 'stackr_gate0_seller_least_privilege_assertion_failed';
  end if;

  if exists (
    select 1
    from (values
      ('authenticated', 'SELECT', true),
      ('authenticated', 'INSERT', false),
      ('authenticated', 'UPDATE', false),
      ('authenticated', 'DELETE', false),
      ('service_role', 'SELECT', true),
      ('service_role', 'INSERT', true),
      ('service_role', 'UPDATE', true),
      ('service_role', 'DELETE', true)
    ) as expected_grant(role_name, privilege_name, allowed)
    where pg_catalog.has_table_privilege(
      expected_grant.role_name,
      'private.seller_inventory_batch_commits',
      expected_grant.privilege_name
    ) is distinct from expected_grant.allowed
  ) then
    raise exception 'stackr_gate0_seller_receipt_privilege_assertion_failed';
  end if;

  if exists (
    select 1
    from (values
      ('authenticated', 'USAGE', false),
      ('authenticated', 'SELECT', false),
      ('authenticated', 'UPDATE', false),
      ('service_role', 'USAGE', true),
      ('service_role', 'SELECT', true),
      ('service_role', 'UPDATE', false)
    ) as expected_grant(role_name, privilege_name, allowed)
    where pg_catalog.has_sequence_privilege(
      expected_grant.role_name,
      'public.seller_sale_transaction_items_id_seq',
      expected_grant.privilege_name
    ) is distinct from expected_grant.allowed
  ) then
    raise exception 'stackr_gate0_seller_sequence_privilege_assertion_failed';
  end if;

  if pg_catalog.to_regprocedure(
    'public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)'
  ) is null
    or not (
      select function_record.prosecdef
      from pg_catalog.pg_proc as function_record
      where function_record.oid = pg_catalog.to_regprocedure(
        'public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)'
      )
    )
    or not (
      select function_record.proconfig @> array['search_path=""']
      from pg_catalog.pg_proc as function_record
      where function_record.oid = pg_catalog.to_regprocedure(
        'public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)'
      )
    )
    or pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
      'public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)'
    )) not like '%stackr_gate0_user_has_premium_seller%'
    or pg_catalog.has_function_privilege(
      'anon',
      'public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'execute'
    )
    or not pg_catalog.has_function_privilege(
      'authenticated',
      'public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'execute'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'execute'
    )
    or pg_catalog.to_regprocedure(
      'private.commit_seller_inventory_batch_delegate(text,jsonb,jsonb,jsonb,jsonb,jsonb)'
    ) is null
    or pg_catalog.has_function_privilege(
      'authenticated',
      'private.commit_seller_inventory_batch_delegate(text,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'execute'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'private.commit_seller_inventory_batch_delegate(text,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'execute'
    )
  then
    raise exception 'stackr_gate0_seller_rpc_privilege_assertion_failed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy as policy_record
    join pg_catalog.pg_class as relation
      on relation.oid = policy_record.polrelid
    join pg_catalog.pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    where relation_schema.nspname = 'private'
      and relation.relname = 'seller_inventory_batch_commits'
      and policy_record.polname =
        'Stackr Gate 0 entitled seller batch commits'
      and not policy_record.polpermissive
      and policy_record.polcmd = 'a'
      and policy_record.polroles @> array[
        (select role_record.oid
         from pg_catalog.pg_roles as role_record
         where role_record.rolname = 'authenticated')
      ]
      and coalesce(
        pg_catalog.pg_get_expr(
          policy_record.polwithcheck,
          policy_record.polrelid
        ),
        ''
      ) like '%stackr_gate0_user_has_premium_seller%'
      and coalesce(
        pg_catalog.pg_get_expr(
          policy_record.polwithcheck,
          policy_record.polrelid
        ),
        ''
      ) not like '%auth.jwt%'
  ) then
    raise exception 'stackr_gate0_seller_batch_entitlement_assertion_failed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy as policy_record
    join pg_catalog.pg_class as relation
      on relation.oid = policy_record.polrelid
    join pg_catalog.pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    where relation_schema.nspname = 'private'
      and relation.relname = 'seller_inventory_batch_commits'
      and policy_record.polname =
        'Stackr Gate 0 entitled seller batch reads'
      and not policy_record.polpermissive
      and policy_record.polcmd = 'r'
      and policy_record.polroles @> array[
        (select role_record.oid
         from pg_catalog.pg_roles as role_record
         where role_record.rolname = 'authenticated')
      ]
      and coalesce(
        pg_catalog.pg_get_expr(
          policy_record.polqual,
          policy_record.polrelid
        ),
        ''
      ) like '%stackr_gate0_user_has_premium_seller%'
      and coalesce(
        pg_catalog.pg_get_expr(
          policy_record.polqual,
          policy_record.polrelid
        ),
        ''
      ) not like '%auth.jwt%'
  ) then
    raise exception 'stackr_gate0_seller_batch_read_entitlement_assertion_failed';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_trigger as trigger_record
    join pg_catalog.pg_class as relation
      on relation.oid = trigger_record.tgrelid
    join pg_catalog.pg_namespace as relation_schema
      on relation_schema.oid = relation.relnamespace
    where not trigger_record.tgisinternal
      and trigger_record.tgenabled = 'O'
      and trigger_record.tgtype = 31
      and trigger_record.tgname = 'stackr_gate0_guard_seller_entitlement'
      and trigger_record.tgfoid = pg_catalog.to_regprocedure(
        'public.stackr_gate0_guard_seller_entitlement()'
      )
      and (
        (relation_schema.nspname = 'public' and relation.relname in (
          'seller_inventory_items',
          'inventory_movements',
          'seller_sale_transactions',
          'seller_sale_transaction_items'
        ))
        or (
          relation_schema.nspname = 'private'
          and relation.relname = 'seller_inventory_batch_commits'
        )
      )
  ) <> 5 then
    raise exception 'stackr_gate0_seller_entitlement_trigger_assertion_failed';
  end if;

  if exists (
    select 1
    from (values
      ('sender_sent', 'INSERT'),
      ('sender_sent', 'UPDATE'),
      ('receiver_sent', 'INSERT'),
      ('receiver_sent', 'UPDATE'),
      ('sender_received', 'INSERT'),
      ('sender_received', 'UPDATE'),
      ('receiver_received', 'INSERT'),
      ('receiver_received', 'UPDATE'),
      ('completed_at', 'INSERT'),
      ('completed_at', 'UPDATE'),
      ('sender_id', 'UPDATE'),
      ('receiver_id', 'UPDATE'),
      ('listing_id', 'UPDATE'),
      ('from_user', 'UPDATE')
    ) as blocked_column(column_name, privilege_name)
    cross join (values
      ('anon'),
      ('authenticated'),
      ('service_role')
    ) as api_role(role_name)
    where pg_catalog.has_column_privilege(
      api_role.role_name,
      'public.trade_offers',
      blocked_column.column_name,
      blocked_column.privilege_name
    )
  ) then
    raise exception 'stackr_gate0_trade_fulfilment_column_assertion_failed';
  end if;

  if not pg_catalog.has_column_privilege(
    'authenticated', 'public.trade_offers', 'sender_id', 'insert'
  )
    or not pg_catalog.has_column_privilege(
      'authenticated', 'public.trade_offers', 'status', 'update'
    )
    or not pg_catalog.has_column_privilege(
      'authenticated', 'public.trade_offers', 'message', 'update'
    )
    or not pg_catalog.has_column_privilege(
      'service_role', 'public.trade_offers', 'sender_id', 'insert'
    )
    or not pg_catalog.has_column_privilege(
      'service_role', 'public.trade_offers', 'status', 'update'
    )
  then
    raise exception 'stackr_gate0_safe_trade_offer_column_assertion_failed';
  end if;

  if pg_catalog.to_regclass('public.trade_listings') is not null
    and exists (
      select 1
      from (values
        ('anon'),
        ('authenticated'),
        ('service_role')
      ) as api_role(role_name)
      cross join (values
        ('SELECT'),
        ('INSERT'),
        ('UPDATE'),
        ('DELETE')
      ) as checked_privilege(privilege_name)
      where pg_catalog.has_table_privilege(
        api_role.role_name,
        'public.trade_listings',
        checked_privilege.privilege_name
      )
    )
  then
    raise exception 'stackr_gate0_legacy_trade_listing_privilege_assertion_failed';
  end if;

  if pg_catalog.to_regclass('public.marketplace_listings') is not null
    and exists (
      select 1
      from (values
        ('anon'),
        ('authenticated'),
        ('service_role')
      ) as api_role(role_name)
      cross join (values
        ('SELECT'),
        ('INSERT'),
        ('UPDATE'),
        ('DELETE')
      ) as checked_privilege(privilege_name)
      where pg_catalog.has_table_privilege(
        api_role.role_name,
        'public.marketplace_listings',
        checked_privilege.privilege_name
      )
    )
  then
    raise exception 'stackr_gate0_legacy_marketplace_listing_privilege_assertion_failed';
  end if;

  if pg_catalog.has_table_privilege(
    'anon', 'public.trade_cash_terms', 'select'
  )
    or pg_catalog.has_table_privilege(
      'authenticated', 'public.trade_cash_terms', 'select'
    )
    or pg_catalog.has_table_privilege(
      'service_role', 'public.trade_cash_terms', 'insert'
    )
  then
    raise exception 'stackr_gate0_cash_terms_privilege_assertion_failed';
  end if;

  if pg_catalog.has_table_privilege(
    'anon', 'public.trades', 'select'
  )
    or pg_catalog.has_table_privilege(
      'authenticated', 'public.trades', 'update'
    )
    or pg_catalog.has_table_privilege(
      'service_role', 'public.trades', 'insert'
    )
  then
    raise exception 'stackr_gate0_legacy_trade_privilege_assertion_failed';
  end if;

  if pg_catalog.has_column_privilege(
    'anon', 'public.user_card_flags', 'payment_intent_id', 'insert'
  )
    or pg_catalog.has_column_privilege(
      'authenticated', 'public.user_card_flags', 'payment_intent_id', 'insert'
    )
    or pg_catalog.has_column_privilege(
      'authenticated', 'public.user_card_flags', 'payment_intent_id', 'update'
    )
    or pg_catalog.has_column_privilege(
      'service_role', 'public.user_card_flags', 'payment_intent_id', 'insert'
    )
    or pg_catalog.has_column_privilege(
      'service_role', 'public.user_card_flags', 'payment_intent_id', 'update'
    )
  then
    raise exception 'stackr_gate0_listing_payment_privilege_assertion_failed';
  end if;

  if exists (
    select 1
    from public.user_card_flags as listing
    where listing.listing_status = 'sold'
  ) then
    raise exception 'stackr_gate0_sold_listing_state_assertion_failed';
  end if;

  if exists (
    select 1
    from public.user_card_flags as listing
    where listing.flag_type = 'trade'
      and coalesce(listing.listing_status, 'active') = 'active'
      and not private.stackr_gate0_user_has_premium_seller(listing.user_id)
  ) then
    raise exception 'stackr_gate0_unentitled_active_listing_assertion_failed';
  end if;

  if pg_catalog.has_column_privilege(
    'authenticated', 'public.profiles', 'stripe_account_id', 'insert'
  )
    or pg_catalog.has_column_privilege(
      'authenticated', 'public.profiles', 'stripe_account_id', 'update'
    )
    or pg_catalog.has_column_privilege(
      'service_role', 'public.profiles', 'stripe_account_id', 'insert'
    )
    or pg_catalog.has_column_privilege(
      'service_role', 'public.profiles', 'stripe_account_id', 'update'
    )
  then
    raise exception 'stackr_gate0_profile_payment_privilege_assertion_failed';
  end if;

  if pg_catalog.to_regprocedure('public.accept_trade_offer(uuid)') is not null
    and (
      pg_catalog.has_function_privilege(
        'anon', 'public.accept_trade_offer(uuid)', 'execute'
      )
      or pg_catalog.has_function_privilege(
        'authenticated', 'public.accept_trade_offer(uuid)', 'execute'
      )
      or pg_catalog.has_function_privilege(
        'service_role', 'public.accept_trade_offer(uuid)', 'execute'
      )
    )
  then
    raise exception 'stackr_gate0_accept_trade_offer_privilege_assertion_failed';
  end if;

  -- Close the preflight-to-DDL race atomically. Safe card-only offer, event and
  -- card totals are intentionally not constrained; only forbidden financial,
  -- fulfilment, binding and hidden-lifecycle states make the migration abort.
  select coalesce(sum(forbidden_state.row_count), 0)
  into forbidden_count
  from (
    values
      ('cash_terms', (
        select count(*)::bigint from public.trade_cash_terms
      )),
      ('legacy_fulfilment', (
        select count(*)::bigint from public.trades
      )),
      ('trade_reviews', (
        select count(*)::bigint from public.trade_reviews
      )),
      ('trader_ratings', (
        select count(*)::bigint from public.trader_ratings
      )),
      ('unsafe_trade_offers', (
        select count(*)::bigint
        from public.trade_offers as offer
        where offer.status is null
          or offer.status <> all(array[
            'pending', 'accepted', 'declined', 'cancelled', 'disputed'
          ])
          or offer.sender_sent is distinct from false
          or offer.receiver_sent is distinct from false
          or offer.sender_received is distinct from false
          or offer.receiver_received is distinct from false
          or offer.completed_at is not null
      )),
      ('invalid_offer_bindings', (
        select count(*)::bigint
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
      )),
      ('invalid_disputed_offers', (
        select count(*)::bigint
        from public.trade_offers as offer
        where offer.status = 'disputed'
          and not private.stackr_gate0_card_trade_dispute_allowed(
            offer.id,
            offer.sender_id
          )
      )),
      ('invalid_offer_card_owners', (
        select count(*)::bigint
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
      )),
      -- Existing rows predate the locked INSERT guard, so prove sender
      -- ownership once at deployment. This is intentionally not a permanent
      -- reservation: later legitimate binder depletion remains possible.
      ('invalid_sender_offer_cards_at_apply', (
        select count(*)::bigint
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
      )),
      ('unsafe_trade_events', (
        select count(*)::bigint
        from public.trade_offer_events as event
        where event.proposed_cash_amount is not null
          or event.event_type is null
          or event.event_type <> all(array[
            'offer_created', 'message', 'counter_offer', 'pending',
            'accepted', 'declined', 'cancelled', 'disputed'
          ])
          or coalesce(event.proposed_status <> all(array[
            'pending', 'accepted', 'declined', 'cancelled', 'disputed'
          ]), false)
      )),
      ('invalid_disputed_events', (
        select count(*)::bigint
        from public.trade_offer_events as event
        where (
          event.event_type = 'disputed'
          or event.proposed_status = 'disputed'
        )
          and not private.stackr_gate0_card_trade_dispute_allowed(
            event.offer_id,
            event.user_id
          )
      )),
      ('listing_payment_bindings', (
        select count(*)::bigint
        from public.user_card_flags
        where payment_intent_id is not null
      )),
      ('sold_listings', (
        select count(*)::bigint
        from public.user_card_flags
        where listing_status = 'sold'
      )),
      ('unentitled_active_listings', (
        select count(*)::bigint
        from public.user_card_flags as listing
        where listing.flag_type = 'trade'
          and coalesce(listing.listing_status, 'active') = 'active'
          and not private.stackr_gate0_user_has_premium_seller(
            listing.user_id
          )
      )),
      ('profile_stripe_bindings', (
        select count(*)::bigint
        from public.profiles
        where stripe_account_id is not null
      ))
  ) as forbidden_state(surface, row_count);

  if forbidden_count <> 0 then
    raise exception 'stackr_gate0_forbidden_state_assertion_failed:%',
      forbidden_count;
  end if;

  if pg_catalog.to_regclass('public.family_purchase_requests') is not null then
    execute 'select count(*)::bigint from public.family_purchase_requests'
      into forbidden_count;
    if forbidden_count <> 0 then
      raise exception 'stackr_gate0_family_purchase_state_assertion_failed:%',
        forbidden_count;
    end if;
  end if;

  if pg_catalog.to_regclass('public.trade_listings') is not null then
    execute 'select count(*)::bigint from public.trade_listings'
      into forbidden_count;
    if forbidden_count <> 0 then
      raise exception 'stackr_gate0_legacy_trade_listing_state_assertion_failed:%',
        forbidden_count;
    end if;
  end if;

  if pg_catalog.to_regclass('public.marketplace_listings') is not null then
    execute 'select count(*)::bigint from public.marketplace_listings'
      into forbidden_count;
    if forbidden_count <> 0 then
      raise exception 'stackr_gate0_legacy_marketplace_listing_state_assertion_failed:%',
        forbidden_count;
    end if;
  end if;

  if exists (
    with allowed_function(signature, anon_allowed, authenticated_allowed, service_allowed) as (
      values
        ('public.admin_binder_directory()', false, true, true),
        ('public.archive_family_child_profile(uuid)', false, true, false),
        ('public.create_family_child_profile(text,text,boolean)', false, true, false),
        ('public.get_active_scanner_threshold_set()', false, true, true),
        ('public.is_admin()', true, true, true),
        ('public.is_recognition_feedback_reviewer()', false, true, true),
        ('public.is_scan_lab_admin()', false, true, true),
        ('public.purchase_cosmetic(text)', false, true, true),
        ('public.recalculate_binder_values(uuid)', false, true, true),
        ('public.update_binder_card_prices()', false, false, true),
        ('public.commit_seller_inventory_batch(text,jsonb,jsonb,jsonb,jsonb,jsonb)', false, true, false),
        ('private.stackr_gate0_user_has_premium_seller(uuid)', true, true, true),
        ('private.stackr_gate0_card_trade_dispute_allowed(uuid,uuid)', false, true, false)
    )
    select 1
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as function_schema
      on function_schema.oid = function_record.pronamespace
    join pg_catalog.pg_roles as function_owner
      on function_owner.oid = function_record.proowner
    left join allowed_function
      on pg_catalog.to_regprocedure(allowed_function.signature)
        = function_record.oid
    where function_schema.nspname in ('public', 'private')
      and (
        function_owner.rolname <> 'postgres'
        or exists (
          select 1
          from pg_catalog.aclexplode(
            coalesce(
              function_record.proacl,
              pg_catalog.acldefault('f', function_record.proowner)
            )
          ) as privilege
          where privilege.grantee = 0
            and privilege.privilege_type = 'EXECUTE'
        )
        or pg_catalog.has_function_privilege(
          'anon', function_record.oid, 'EXECUTE'
        ) is distinct from coalesce(allowed_function.anon_allowed, false)
        or pg_catalog.has_function_privilege(
          'authenticated', function_record.oid, 'EXECUTE'
        ) is distinct from coalesce(
          allowed_function.authenticated_allowed,
          false
        )
        or pg_catalog.has_function_privilege(
          'service_role', function_record.oid, 'EXECUTE'
        ) is distinct from coalesce(allowed_function.service_allowed, false)
      )
  ) then
    raise exception 'stackr_gate0_protected_function_acl_matrix_assertion_failed';
  end if;

  -- A missing global function-default ACL row retains PostgreSQL's implicit
  -- EXECUTE grant to PUBLIC. Require an explicit safe row for every role that
  -- owns migration-created functions, even when this executor cannot alter it.
  if exists (
    select 1
    from (
      select current_user::text as owner_role
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
    ) as required_owner
    where not exists (
      select 1
      from pg_catalog.pg_default_acl as defaults
      join pg_catalog.pg_roles as owner_role
        on owner_role.oid = defaults.defaclrole
      where owner_role.rolname = required_owner.owner_role
        and defaults.defaclnamespace = 0
        and defaults.defaclobjtype = 'f'
        and not exists (
          select 1
          from pg_catalog.aclexplode(defaults.defaclacl) as privilege
          left join pg_catalog.pg_roles as grantee_role
            on grantee_role.oid = privilege.grantee
          where privilege.privilege_type = 'EXECUTE'
            and (
              privilege.grantee = 0
              or grantee_role.rolname in (
                'anon', 'authenticated', 'service_role'
              )
            )
        )
    )
  ) then
    raise exception 'stackr_gate0_global_function_default_acl_assertion_failed';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_default_acl as defaults
    join pg_catalog.pg_roles as owner_role
      on owner_role.oid = defaults.defaclrole
    left join pg_catalog.pg_namespace as default_schema
      on default_schema.oid = defaults.defaclnamespace
    cross join lateral pg_catalog.aclexplode(defaults.defaclacl) as privilege
    left join pg_catalog.pg_roles as grantee_role
      on grantee_role.oid = privilege.grantee
    where owner_role.rolname in (
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
      and (
        defaults.defaclnamespace = 0
        or default_schema.nspname in ('public', 'private')
      )
      and (
        privilege.grantee = 0
        or grantee_role.rolname in ('anon', 'authenticated', 'service_role')
      )
      and defaults.defaclobjtype in ('r', 'S', 'f')
  ) then
    raise exception 'stackr_gate0_default_privilege_assertion_failed';
  end if;
end;
$assertions$;

comment on function public.stackr_gate0_block_financial_write() is
  'Gate 0 fail-closed trigger for tables whose entire write surface is financial.';
comment on function public.stackr_gate0_block_legacy_fulfilment_write() is
  'Gate 0 fail-closed trigger for the retired legacy shipping-state table.';
comment on function public.stackr_gate0_guard_profile_financial_binding() is
  'Gate 0 preserves legacy Stripe IDs but rejects every new or changed binding.';
comment on function public.stackr_gate0_guard_listing_financial_state() is
  'Gate 0 rejects listing payment/sold state, unentitled active listings, trade identity rewrites and referenced deletes.';
comment on function public.stackr_gate0_guard_trade_offer_financial_state() is
  'Gate 0 blocks payment lifecycle states while preserving card-only trade transitions.';
comment on function public.stackr_gate0_guard_trade_event_financial_state() is
  'Gate 0 blocks cash and payment events while preserving card-only trade events.';
comment on function public.stackr_gate0_guard_trade_offer_card_membership() is
  'Gate 0 binds one receiver card to the referenced listing and requires a locked positive canonical sender ownership snapshot.';
comment on function public.stackr_gate0_guard_seller_entitlement() is
  'Gate 0 requires current server-owned Premium Seller entitlement for every seller mutation, including RLS bypass roles.';
comment on function private.stackr_gate0_user_has_premium_seller(uuid) is
  'Hardened current-entitlement lookup using auth.users.raw_app_meta_data only.';
comment on function private.stackr_gate0_card_trade_dispute_allowed(uuid, uuid) is
  'Hardened participant, complete bound-card and no-cash eligibility check for non-order trade disputes.';

reset statement_timeout;
reset lock_timeout;
