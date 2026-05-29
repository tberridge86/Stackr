alter table public.binders enable row level security;
alter table public.binder_cards enable row level security;

drop policy if exists "Users can read own or public binders" on public.binders;
create policy "Users can read own or public binders"
  on public.binders
  for select
  using (auth.uid() = user_id or is_public = true);

drop policy if exists "Users can create own binders" on public.binders;
create policy "Users can create own binders"
  on public.binders
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own binders" on public.binders;
create policy "Users can update own binders"
  on public.binders
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own binders" on public.binders;
create policy "Users can delete own binders"
  on public.binders
  for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read cards in own or public binders" on public.binder_cards;
create policy "Users can read cards in own or public binders"
  on public.binder_cards
  for select
  using (
    exists (
      select 1
      from public.binders
      where binders.id = binder_cards.binder_id
        and (binders.user_id = auth.uid() or binders.is_public = true)
    )
  );

drop policy if exists "Users can create cards in own binders" on public.binder_cards;
create policy "Users can create cards in own binders"
  on public.binder_cards
  for insert
  with check (
    exists (
      select 1
      from public.binders
      where binders.id = binder_cards.binder_id
        and binders.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update cards in own binders" on public.binder_cards;
create policy "Users can update cards in own binders"
  on public.binder_cards
  for update
  using (
    exists (
      select 1
      from public.binders
      where binders.id = binder_cards.binder_id
        and binders.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.binders
      where binders.id = binder_cards.binder_id
        and binders.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete cards in own binders" on public.binder_cards;
create policy "Users can delete cards in own binders"
  on public.binder_cards
  for delete
  using (
    exists (
      select 1
      from public.binders
      where binders.id = binder_cards.binder_id
        and binders.user_id = auth.uid()
    )
  );
