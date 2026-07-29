create table if not exists public.achievement_coin_rewards (
  achievement_id text primary key,
  coin_reward integer not null check (coin_reward >= 0),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.achievement_coin_rewards (achievement_id, coin_reward, metadata)
values
  ('first_binder', 25, '{"tier":"bronze"}'::jsonb),
  ('binder_builder_3', 75, '{"tier":"silver"}'::jsonb),
  ('first_card', 25, '{"tier":"bronze"}'::jsonb),
  ('ten_cards', 50, '{"tier":"bronze"}'::jsonb),
  ('hundred_cards', 150, '{"tier":"gold"}'::jsonb),
  ('first_scan', 25, '{"tier":"bronze"}'::jsonb),
  ('scanner_25', 100, '{"tier":"silver"}'::jsonb),
  ('first_public_binder', 50, '{"tier":"bronze"}'::jsonb),
  ('master_mode', 75, '{"tier":"silver"}'::jsonb),
  ('quarter_binder', 50, '{"tier":"bronze"}'::jsonb),
  ('half_binder', 75, '{"tier":"silver"}'::jsonb),
  ('almost_complete', 125, '{"tier":"gold"}'::jsonb),
  ('binder_complete', 200, '{"tier":"gold"}'::jsonb),
  ('master_set_complete', 500, '{"tier":"rainbow"}'::jsonb),
  ('five_complete', 750, '{"tier":"rainbow"}'::jsonb)
on conflict (achievement_id) do update
set
  coin_reward = excluded.coin_reward,
  metadata = excluded.metadata,
  updated_at = now();

create or replace function public.award_achievement_unlock_coins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reward integer;
  reward_metadata jsonb;
begin
  select coin_reward, metadata
    into reward, reward_metadata
  from public.achievement_coin_rewards
  where achievement_id = new.achievement_id;

  if coalesce(reward, 0) > 0 then
    insert into public.user_coin_ledger (
      user_id,
      amount,
      reason,
      achievement_id,
      metadata
    )
    values (
      new.user_id,
      reward,
      'achievement_unlock',
      new.achievement_id,
      coalesce(reward_metadata, '{}'::jsonb) || jsonb_build_object('achievement_id', new.achievement_id)
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists user_achievements_award_coins on public.user_achievements;
create trigger user_achievements_award_coins
  after insert on public.user_achievements
  for each row
  execute function public.award_achievement_unlock_coins();

insert into public.user_coin_ledger (
  user_id,
  amount,
  reason,
  achievement_id,
  metadata
)
select
  achievement.user_id,
  reward.coin_reward,
  'achievement_unlock',
  achievement.achievement_id,
  coalesce(reward.metadata, '{}'::jsonb) || jsonb_build_object('achievement_id', achievement.achievement_id)
from public.user_achievements achievement
join public.achievement_coin_rewards reward
  on reward.achievement_id = achievement.achievement_id
where reward.coin_reward > 0
on conflict do nothing;

create table if not exists public.cosmetic_catalog (
  cosmetic_id text primary key,
  name text not null,
  cosmetic_type text not null check (cosmetic_type in ('banner', 'border')),
  price integer not null check (price >= 0),
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.cosmetic_catalog (cosmetic_id, name, cosmetic_type, price, metadata)
values
  ('banner_purple_pulse', 'Purple Pulse', 'banner', 150, '{"color":"#6D5DF6","accentColor":"#C4B5FD"}'::jsonb),
  ('banner_gold_pull', 'Gold Pull', 'banner', 300, '{"color":"#F6C453","accentColor":"#7C4A03"}'::jsonb),
  ('border_master_set', 'Master Set Frame', 'border', 500, '{"color":"#8B5CF6","accentColor":"#FDE68A"}'::jsonb),
  ('border_trade_ready', 'Trade Ready Frame', 'border', 250, '{"color":"#14B8A6","accentColor":"#CCFBF1"}'::jsonb)
on conflict (cosmetic_id) do update
set
  name = excluded.name,
  cosmetic_type = excluded.cosmetic_type,
  price = excluded.price,
  metadata = excluded.metadata,
  active = true,
  updated_at = now();

alter table public.cosmetic_catalog enable row level security;

drop policy if exists "Authenticated users can read cosmetic catalog" on public.cosmetic_catalog;
create policy "Authenticated users can read cosmetic catalog"
  on public.cosmetic_catalog
  for select
  using (auth.role() = 'authenticated');

create or replace function public.purchase_cosmetic(p_cosmetic_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  item record;
  current_balance integer;
begin
  if current_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'You need to be logged in.');
  end if;

  select *
    into item
  from public.cosmetic_catalog
  where cosmetic_id = p_cosmetic_id
    and active = true;

  if item.cosmetic_id is null then
    return jsonb_build_object('ok', false, 'message', 'This cosmetic is not available.');
  end if;

  if exists (
    select 1
    from public.user_cosmetics
    where user_id = current_user_id
      and cosmetic_id = p_cosmetic_id
  ) then
    return jsonb_build_object('ok', true, 'message', 'Already unlocked.');
  end if;

  select coalesce(sum(amount), 0)
    into current_balance
  from public.user_coin_ledger
  where user_id = current_user_id;

  if current_balance < item.price then
    return jsonb_build_object(
      'ok', false,
      'message', 'You need ' || (item.price - current_balance)::text || ' more coins.'
    );
  end if;

  insert into public.user_cosmetics (
    user_id,
    cosmetic_id,
    source,
    metadata
  )
  values (
    current_user_id,
    p_cosmetic_id,
    'coins',
    jsonb_build_object(
      'name', item.name,
      'type', item.cosmetic_type,
      'price', item.price
    ) || coalesce(item.metadata, '{}'::jsonb)
  );

  insert into public.user_coin_ledger (
    user_id,
    amount,
    reason,
    cosmetic_id,
    metadata
  )
  values (
    current_user_id,
    -item.price,
    'cosmetic_purchase',
    p_cosmetic_id,
    jsonb_build_object(
      'name', item.name,
      'type', item.cosmetic_type
    ) || coalesce(item.metadata, '{}'::jsonb)
  );

  return jsonb_build_object('ok', true, 'message', item.name || ' unlocked.');
exception
  when unique_violation then
    return jsonb_build_object('ok', true, 'message', 'Already unlocked.');
end;
$$;

revoke insert on table public.user_coin_ledger from authenticated;
revoke insert on table public.user_cosmetics from authenticated;

alter table public.achievement_coin_rewards enable row level security;

drop policy if exists "Authenticated users can read achievement coin rewards"
  on public.achievement_coin_rewards;
create policy "Authenticated users can read achievement coin rewards"
  on public.achievement_coin_rewards
  for select
  to authenticated
  using (true);

grant select on table public.achievement_coin_rewards to authenticated;
grant select on table public.cosmetic_catalog to authenticated;
grant execute on function public.purchase_cosmetic(text) to authenticated;
grant select, insert, update, delete on table public.achievement_coin_rewards to service_role;
grant select, insert, update, delete on table public.cosmetic_catalog to service_role;
