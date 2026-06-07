alter table public.user_card_variants
  add column if not exists quantity integer not null default 1 check (quantity >= 1);

do $$
declare
  constraint_record record;
  index_record record;
begin
  for constraint_record in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.user_card_variants'::regclass
      and con.contype = 'u'
      and exists (
        select 1
        from unnest(con.conkey) key(attnum)
        join pg_attribute attr on attr.attrelid = con.conrelid and attr.attnum = key.attnum
        where attr.attname = 'user_id'
      )
      and exists (
        select 1
        from unnest(con.conkey) key(attnum)
        join pg_attribute attr on attr.attrelid = con.conrelid and attr.attnum = key.attnum
        where attr.attname = 'card_id'
      )
      and not exists (
        select 1
        from unnest(con.conkey) key(attnum)
        join pg_attribute attr on attr.attrelid = con.conrelid and attr.attnum = key.attnum
        where attr.attname = 'variant'
      )
  loop
    execute format('alter table public.user_card_variants drop constraint if exists %I', constraint_record.conname);
  end loop;

  for index_record in
    select ns.nspname as schema_name, idx.relname as index_name
    from pg_index ind
    join pg_class idx on idx.oid = ind.indexrelid
    join pg_class tbl on tbl.oid = ind.indrelid
    join pg_namespace ns on ns.oid = idx.relnamespace
    where tbl.oid = 'public.user_card_variants'::regclass
      and ind.indisunique
      and not ind.indisprimary
      and not exists (
        select 1
        from pg_constraint con
        where con.conindid = ind.indexrelid
      )
      and exists (
        select 1
        from unnest(ind.indkey) key(attnum)
        join pg_attribute attr on attr.attrelid = tbl.oid and attr.attnum = key.attnum
        where attr.attname = 'user_id'
      )
      and exists (
        select 1
        from unnest(ind.indkey) key(attnum)
        join pg_attribute attr on attr.attrelid = tbl.oid and attr.attnum = key.attnum
        where attr.attname = 'card_id'
      )
      and not exists (
        select 1
        from unnest(ind.indkey) key(attnum)
        join pg_attribute attr on attr.attrelid = tbl.oid and attr.attnum = key.attnum
        where attr.attname = 'variant'
      )
  loop
    execute format('drop index if exists %I.%I', index_record.schema_name, index_record.index_name);
  end loop;
end $$;

with ranked as (
  select
    ctid,
    row_number() over (
      partition by user_id, card_id, set_id, variant
      order by ctid
    ) as row_number,
    max(quantity) over (
      partition by user_id, card_id, set_id, variant
    ) as merged_quantity
  from public.user_card_variants
)
update public.user_card_variants variants
set quantity = greatest(1, ranked.merged_quantity)
from ranked
where variants.ctid = ranked.ctid
  and ranked.row_number = 1;

with ranked as (
  select
    ctid,
    row_number() over (
      partition by user_id, card_id, set_id, variant
      order by ctid
    ) as row_number
  from public.user_card_variants
)
delete from public.user_card_variants variants
using ranked
where variants.ctid = ranked.ctid
  and ranked.row_number > 1;

create unique index if not exists user_card_variants_user_card_set_variant_uidx
  on public.user_card_variants(user_id, card_id, set_id, variant);
