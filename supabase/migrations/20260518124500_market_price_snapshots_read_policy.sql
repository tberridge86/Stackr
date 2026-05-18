alter table public.market_price_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'market_price_snapshots'
      and policyname = 'Market price snapshots are readable'
  ) then
    create policy "Market price snapshots are readable"
      on public.market_price_snapshots
      for select
      using (user_id is null or auth.uid() = user_id);
  end if;
end $$;
