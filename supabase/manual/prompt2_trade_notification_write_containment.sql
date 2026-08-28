-- Prompt 2 production containment for unresolved peer-trade state machines and
-- client-authored notifications. Existing rows remain unchanged and readable
-- through their existing ownership policies; every trade mutation is frozen.

begin;

create or replace function public.stackr_prompt2_block_trade_state_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'prompt2_trade_state_frozen'
    using errcode = '42501';
end;
$$;

revoke all on function public.stackr_prompt2_block_trade_state_write()
  from public, anon, authenticated, service_role;

do $trade_tables$
declare
  relation_name text;
  read_roles text;
begin
  foreach relation_name in array array[
    'trade_offers',
    'trade_offer_cards',
    'trade_offer_events',
    'trade_cash_terms',
    'trade_listings',
    'trades',
    'trade_reviews',
    'trader_ratings'
  ]
  loop
    if pg_catalog.to_regclass(pg_catalog.format('public.%I', relation_name)) is null then
      continue;
    end if;

    execute pg_catalog.format(
      'drop trigger if exists stackr_prompt2_block_trade_state_write on public.%I',
      relation_name
    );
    execute pg_catalog.format(
      'create trigger stackr_prompt2_block_trade_state_write before insert or update or delete on public.%I for each row execute function public.stackr_prompt2_block_trade_state_write()',
      relation_name
    );
    execute pg_catalog.format(
      'drop trigger if exists stackr_prompt2_block_trade_state_truncate on public.%I',
      relation_name
    );
    execute pg_catalog.format(
      'create trigger stackr_prompt2_block_trade_state_truncate before truncate on public.%I for each statement execute function public.stackr_prompt2_block_trade_state_write()',
      relation_name
    );

    execute pg_catalog.format(
      'revoke all on table public.%I from public, anon, authenticated, service_role',
      relation_name
    );

    if relation_name = 'trade_listings' then
      read_roles := 'anon, authenticated, service_role';
    elsif relation_name in (
      'trade_offers',
      'trade_offer_cards',
      'trade_offer_events',
      'trade_cash_terms',
      'trade_reviews',
      'trader_ratings'
    ) then
      read_roles := 'authenticated, service_role';
    else
      read_roles := 'service_role';
    end if;

    execute pg_catalog.format(
      'grant select on table public.%I to %s',
      relation_name,
      read_roles
    );
  end loop;
end;
$trade_tables$;

-- A focused guard keeps non-trade flags operational while freezing every write
-- involving a trade row.
create or replace function public.stackr_prompt2_block_trade_listing_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (tg_op = 'DELETE' and old.flag_type = 'trade')
    or (tg_op = 'INSERT' and new.flag_type = 'trade')
    or (
      tg_op = 'UPDATE'
      and (old.flag_type = 'trade' or new.flag_type = 'trade')
    )
  then
    raise exception 'prompt2_trade_listing_state_frozen'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.stackr_prompt2_block_trade_listing_write()
  from public, anon, authenticated, service_role;

drop trigger if exists stackr_prompt2_block_trade_listing_write
  on public.user_card_flags;
create trigger stackr_prompt2_block_trade_listing_write
before insert or update or delete on public.user_card_flags
for each row execute function public.stackr_prompt2_block_trade_listing_write();

do $retire_rpc$
begin
  if pg_catalog.to_regprocedure('public.accept_trade_offer(uuid)') is not null then
    revoke all on function public.accept_trade_offer(uuid)
      from public, anon, authenticated, service_role;
  end if;
end;
$retire_rpc$;

create or replace function public.stackr_prompt2_guard_notification_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'prompt2_notification_creation_requires_trusted_backend'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.type is distinct from old.type
    or new.title is distinct from old.title
    or new.message is distinct from old.message
    or new.card_id is distinct from old.card_id
    or new.set_id is distinct from old.set_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'prompt2_notification_content_immutable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.stackr_prompt2_guard_notification_write()
  from public, anon, authenticated, service_role;

alter table public.notifications enable row level security;

do $notification_policies$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'notifications'
  loop
    execute pg_catalog.format(
      'drop policy %I on public.notifications',
      policy_record.policyname
    );
  end loop;
end;
$notification_policies$;

create policy "Prompt 2 notification owner reads"
on public.notifications for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Prompt 2 notification owner read-state updates"
on public.notifications for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Prompt 2 notification owner deletes"
on public.notifications for delete to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists stackr_prompt2_guard_notification_write
  on public.notifications;
create trigger stackr_prompt2_guard_notification_write
before insert or update on public.notifications
for each row execute function public.stackr_prompt2_guard_notification_write();

revoke all on table public.notifications
  from public, anon, authenticated, service_role;
grant select, delete on table public.notifications to authenticated;
grant update (read) on table public.notifications to authenticated;
grant select, insert, update, delete on table public.notifications to service_role;

do $assertions$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'trade_offers',
    'trade_offer_cards',
    'trade_offer_events',
    'trade_cash_terms',
    'trade_listings',
    'trades',
    'trade_reviews',
    'trader_ratings'
  ]
  loop
    if pg_catalog.to_regclass(pg_catalog.format('public.%I', relation_name)) is null then
      continue;
    end if;

    if has_table_privilege('anon', pg_catalog.format('public.%I', relation_name), 'insert')
      or has_table_privilege('authenticated', pg_catalog.format('public.%I', relation_name), 'insert')
      or has_table_privilege('authenticated', pg_catalog.format('public.%I', relation_name), 'update')
      or has_table_privilege('authenticated', pg_catalog.format('public.%I', relation_name), 'delete')
      or has_table_privilege('service_role', pg_catalog.format('public.%I', relation_name), 'insert')
      or has_table_privilege('service_role', pg_catalog.format('public.%I', relation_name), 'update')
      or has_table_privilege('service_role', pg_catalog.format('public.%I', relation_name), 'delete')
      or has_table_privilege('service_role', pg_catalog.format('public.%I', relation_name), 'truncate')
    then
      raise exception 'prompt2_trade_acl_containment_failed:%', relation_name;
    end if;
  end loop;

  if has_column_privilege('authenticated', 'public.notifications', 'title', 'update')
    or has_column_privilege('authenticated', 'public.notifications', 'user_id', 'update')
    or has_table_privilege('authenticated', 'public.notifications', 'insert')
    or not has_column_privilege('authenticated', 'public.notifications', 'read', 'update')
    or (
      pg_catalog.to_regprocedure('public.accept_trade_offer(uuid)') is not null
      and has_function_privilege(
        'authenticated',
        'public.accept_trade_offer(uuid)',
        'execute'
      )
    )
  then
    raise exception 'prompt2_notification_or_rpc_containment_failed';
  end if;
end;
$assertions$;

commit;
