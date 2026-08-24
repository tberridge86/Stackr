-- Parent-owned family profiles and browse-only child purchase requests.
-- Child profiles are not auth users. Every write remains attributable to the
-- verified adult account and is performed through the guarded RPC boundary.

create table public.family_child_profiles (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  age_band text not null,
  status text not null default 'active',
  parent_authority_confirmed_at timestamptz not null,
  managed_notice_version text not null default 'family-managed-v1',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint family_child_profiles_display_name_valid check (
    char_length(btrim(display_name)) between 1 and 40
    and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]]'
  ),
  constraint family_child_profiles_age_band_valid check (
    age_band in ('under_13', '13_15', '16_17')
  ),
  constraint family_child_profiles_status_valid check (
    status in ('active', 'archived')
  ),
  constraint family_child_profiles_notice_version_valid check (
    managed_notice_version = 'family-managed-v1'
  ),
  constraint family_child_profiles_id_parent_unique unique (id, parent_user_id)
);

create unique index family_child_profiles_active_name_uidx
  on public.family_child_profiles (parent_user_id, lower(display_name))
  where status = 'active';

create index family_child_profiles_parent_idx
  on public.family_child_profiles (parent_user_id, status, created_at);

create table public.family_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_profile_id uuid not null references public.family_child_profiles(id) on delete restrict,
  listing_id uuid not null references public.user_card_flags(id) on delete restrict,
  seller_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending',
  requested_price numeric(12, 2),
  currency text not null default 'GBP',
  listing_snapshot jsonb not null,
  requested_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz,
  responded_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint family_purchase_requests_status_valid check (
    status in ('pending', 'approved', 'declined', 'cancelled', 'expired')
  ),
  constraint family_purchase_requests_currency_valid check (currency = 'GBP'),
  constraint family_purchase_requests_price_valid check (
    requested_price is null or requested_price >= 0
  ),
  constraint family_purchase_requests_not_own_listing check (
    parent_user_id <> seller_user_id
  ),
  constraint family_purchase_requests_snapshot_object check (
    jsonb_typeof(listing_snapshot) = 'object'
  ),
  constraint family_purchase_requests_response_consistent check (
    (status = 'pending' and responded_at is null and responded_by is null)
    or
    (status <> 'pending' and responded_at is not null and responded_by = parent_user_id)
  ),
  constraint family_purchase_requests_child_parent_fk foreign key (
    child_profile_id,
    parent_user_id
  ) references public.family_child_profiles (id, parent_user_id) on delete restrict
);

create unique index family_purchase_requests_one_pending_uidx
  on public.family_purchase_requests (child_profile_id, listing_id)
  where status = 'pending';

create index family_purchase_requests_parent_status_idx
  on public.family_purchase_requests (parent_user_id, status, requested_at desc);

create index family_purchase_requests_child_idx
  on public.family_purchase_requests (child_profile_id);

create index family_purchase_requests_listing_idx
  on public.family_purchase_requests (listing_id);

create index family_purchase_requests_seller_idx
  on public.family_purchase_requests (seller_user_id);

create index family_purchase_requests_responder_idx
  on public.family_purchase_requests (responded_by)
  where responded_by is not null;

alter table public.family_child_profiles enable row level security;
alter table public.family_child_profiles force row level security;
alter table public.family_purchase_requests enable row level security;
alter table public.family_purchase_requests force row level security;

create policy family_child_profiles_parent_read
  on public.family_child_profiles
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = parent_user_id
  );

create policy family_purchase_requests_parent_read
  on public.family_purchase_requests
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = parent_user_id
  );

revoke all on table public.family_child_profiles from public, anon, authenticated;
revoke all on table public.family_purchase_requests from public, anon, authenticated;
grant select on table public.family_child_profiles to authenticated;
grant select on table public.family_purchase_requests to authenticated;
grant select, insert, update, delete on table public.family_child_profiles to service_role;
grant select, insert, update, delete on table public.family_purchase_requests to service_role;

create or replace function public.create_family_child_profile(
  p_display_name text,
  p_age_band text,
  p_parent_authority_confirmed boolean
)
returns public.family_child_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_user_id uuid := auth.uid();
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_profile public.family_child_profiles;
begin
  if v_parent_user_id is null
    or coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'A verified adult account is required.' using errcode = '42501';
  end if;

  if char_length(v_display_name) not between 1 and 40
    or v_display_name ~ '[[:cntrl:]]' then
    raise exception 'Child profile name must be between 1 and 40 characters.' using errcode = '22023';
  end if;

  if p_age_band is null or p_age_band not in ('under_13', '13_15', '16_17') then
    raise exception 'A supported child age band is required.' using errcode = '22023';
  end if;

  if p_parent_authority_confirmed is distinct from true then
    raise exception 'Parental responsibility must be confirmed.' using errcode = '42501';
  end if;

  insert into public.family_child_profiles (
    parent_user_id,
    display_name,
    age_band,
    parent_authority_confirmed_at,
    managed_notice_version
  )
  values (
    v_parent_user_id,
    v_display_name,
    p_age_band,
    timezone('utc', now()),
    'family-managed-v1'
  )
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.archive_family_child_profile(
  p_child_profile_id uuid
)
returns public.family_child_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_user_id uuid := auth.uid();
  v_profile public.family_child_profiles;
begin
  if v_parent_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  update public.family_purchase_requests
  set
    status = 'cancelled',
    responded_at = timezone('utc', now()),
    responded_by = v_parent_user_id,
    updated_at = timezone('utc', now())
  where parent_user_id = v_parent_user_id
    and child_profile_id = p_child_profile_id
    and status = 'pending';

  update public.family_child_profiles
  set
    status = 'archived',
    updated_at = timezone('utc', now())
  where id = p_child_profile_id
    and parent_user_id = v_parent_user_id
    and status = 'active'
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'Active child profile not found.' using errcode = 'P0002';
  end if;

  return v_profile;
end;
$$;

create or replace function public.create_family_purchase_request(
  p_child_profile_id uuid,
  p_listing_id uuid
)
returns public.family_purchase_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_user_id uuid := auth.uid();
  v_child public.family_child_profiles;
  v_listing public.user_card_flags;
  v_request public.family_purchase_requests;
begin
  if v_parent_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into v_child
  from public.family_child_profiles
  where id = p_child_profile_id
    and parent_user_id = v_parent_user_id
    and status = 'active'
  for update;

  if v_child.id is null then
    raise exception 'Active child profile not found.' using errcode = 'P0002';
  end if;

  select * into v_request
  from public.family_purchase_requests
  where child_profile_id = p_child_profile_id
    and listing_id = p_listing_id
    and status = 'pending'
  for update;

  if v_request.id is not null then
    return v_request;
  end if;

  select * into v_listing
  from public.user_card_flags
  where id = p_listing_id
    and flag_type = 'trade'
    and coalesce(listing_status, 'active') = 'active'
    and coalesce(trade_only, false) = false
  for share;

  if v_listing.id is null then
    raise exception 'This listing is not currently available for a purchase request.' using errcode = 'P0002';
  end if;

  if v_listing.user_id = v_parent_user_id then
    raise exception 'A child cannot request a listing owned by their parent account.' using errcode = '22023';
  end if;

  insert into public.family_purchase_requests (
    parent_user_id,
    child_profile_id,
    listing_id,
    seller_user_id,
    requested_price,
    currency,
    listing_snapshot
  )
  values (
    v_parent_user_id,
    v_child.id,
    v_listing.id,
    v_listing.user_id,
    v_listing.asking_price,
    'GBP',
    jsonb_build_object(
      'listingId', v_listing.id,
      'sellerUserId', v_listing.user_id,
      'cardId', v_listing.card_id,
      'setId', v_listing.set_id,
      'productType', v_listing.product_type,
      'productName', v_listing.product_name,
      'condition', v_listing.condition,
      'askingPrice', v_listing.asking_price,
      'listingStatus', coalesce(v_listing.listing_status, 'active'),
      'capturedAt', timezone('utc', now())
    )
  )
  on conflict (child_profile_id, listing_id) where status = 'pending'
  do nothing
  returning * into v_request;

  if v_request.id is null then
    select * into v_request
    from public.family_purchase_requests
    where child_profile_id = p_child_profile_id
      and listing_id = p_listing_id
      and status = 'pending';
  end if;

  return v_request;
end;
$$;

create or replace function public.respond_family_purchase_request(
  p_request_id uuid,
  p_decision text
)
returns public.family_purchase_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_user_id uuid := auth.uid();
  v_request public.family_purchase_requests;
  v_listing_available boolean;
begin
  if v_parent_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'declined') then
    raise exception 'Decision must be approved or declined.' using errcode = '22023';
  end if;

  select * into v_request
  from public.family_purchase_requests
  where id = p_request_id
    and parent_user_id = v_parent_user_id
    and status = 'pending'
  for update;

  if v_request.id is null then
    raise exception 'Pending purchase request not found.' using errcode = 'P0002';
  end if;

  if p_decision = 'approved' then
    select exists (
      select 1
      from public.user_card_flags
      where id = v_request.listing_id
        and flag_type = 'trade'
        and coalesce(listing_status, 'active') = 'active'
        and coalesce(trade_only, false) = false
        and user_id = v_request.seller_user_id
    ) into v_listing_available;

    if not v_listing_available then
      update public.family_purchase_requests
      set
        status = 'expired',
        responded_at = timezone('utc', now()),
        responded_by = v_parent_user_id,
        updated_at = timezone('utc', now())
      where id = v_request.id
      returning * into v_request;

      return v_request;
    end if;
  end if;

  update public.family_purchase_requests
  set
    status = p_decision,
    responded_at = timezone('utc', now()),
    responded_by = v_parent_user_id,
    updated_at = timezone('utc', now())
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.create_family_child_profile(text, text, boolean) from public, anon, authenticated;
revoke all on function public.archive_family_child_profile(uuid) from public, anon, authenticated;
revoke all on function public.create_family_purchase_request(uuid, uuid) from public, anon, authenticated;
revoke all on function public.respond_family_purchase_request(uuid, text) from public, anon, authenticated;

grant execute on function public.create_family_child_profile(text, text, boolean) to authenticated;
grant execute on function public.archive_family_child_profile(uuid) to authenticated;
grant execute on function public.create_family_purchase_request(uuid, uuid) to authenticated;
grant execute on function public.respond_family_purchase_request(uuid, text) to authenticated;

comment on table public.family_child_profiles is
  'Non-auth child profiles owned and managed by an authenticated adult account.';
comment on table public.family_purchase_requests is
  'Browse-only child marketplace requests. Approval records parental intent but never initiates payment or reserves a listing.';
