-- Personal pricing is delivered by the owner-authorised backend path. Retained
-- provider payloads and shared (user_id null) snapshots must not be exposed by
-- the Data API to anonymous or other authenticated users.

alter table public.price_observations enable row level security;
alter table public.market_price_snapshots enable row level security;

-- Observations can contain provider listing payloads. Close only SELECT for
-- clients; unrelated existing write privileges are intentionally untouched.
revoke select on table public.price_observations from public, anon, authenticated;
drop policy if exists "Client reads of retained price observations are denied"
  on public.price_observations;
create policy "Client reads of retained price observations are denied"
  on public.price_observations
  as restrictive
  for select
  to anon, authenticated
  using (false);

-- Removing SELECT from PUBLIC/anon closes shared snapshots without changing
-- authenticated INSERT/UPDATE/DELETE grants or their existing write policies.
revoke select on table public.market_price_snapshots from public, anon;
grant select on table public.market_price_snapshots to authenticated;

-- Keep an explicit owner read path, then constrain every authenticated pricing
-- operation (including a pre-existing permissive ALL/INSERT policy) to a
-- non-null row owned by the current user. Shared canonical rows use user_id
-- null and cannot be read, inserted, updated, or reassigned by clients.
drop policy if exists "Users may read own personal market price snapshots"
  on public.market_price_snapshots;
create policy "Users may read own personal market price snapshots"
  on public.market_price_snapshots
  for select
  to authenticated
  using ((select auth.uid()) = user_id and user_id is not null);

drop policy if exists "Personal pricing snapshot reads require owner"
  on public.market_price_snapshots;
create policy "Personal pricing snapshot reads require owner"
  on public.market_price_snapshots
  as restrictive
  for all
  to anon, authenticated
  using ((select auth.uid()) = user_id and user_id is not null)
  with check ((select auth.uid()) = user_id and user_id is not null);

comment on table public.price_observations is
  'Private retained pricing observations including provider payloads. Direct client SELECT is denied; clients read through the owner-authorised pricing API.';

comment on table public.market_price_snapshots is
  'Shared canonical rows (user_id null) are backend-only. Direct authenticated reads remain limited to an auth.uid()-owned personal row.';
