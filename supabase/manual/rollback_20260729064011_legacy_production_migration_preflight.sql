-- Conservative rollback for 20260729064011.
-- Run before accepting writes through the repaired objects. Only columns and
-- tables carrying the preflight marker are eligible for removal.

do $rollback$
declare
  column_name text;
  marker text := 'Created by 20260729064011 legacy production migration preflight.';
begin
  if pg_catalog.to_regclass('public.price_alerts') is not null then
    foreach column_name in array array[
      'updated_at',
      'active',
      'target_price_gbp',
      'grade',
      'grader',
      'raw_or_graded',
      'language',
      'product_key',
      'stackr_card_id'
    ]
    loop
      if exists (
        select 1
        from pg_catalog.pg_attribute a
        where a.attrelid = 'public.price_alerts'::regclass
          and a.attname = column_name
          and pg_catalog.col_description(a.attrelid, a.attnum) = marker
      ) then
        if column_name = 'active'
           and exists (select 1 from public.price_alerts where active is distinct from true) then
          raise exception 'Rollback blocked: price_alerts.active contains changed values';
        end if;
        execute pg_catalog.format(
          'alter table public.price_alerts drop column %I',
          column_name
        );
      end if;
    end loop;
  end if;

  if pg_catalog.to_regclass('public.inventory_movements') is not null
     and exists (
       select 1
       from pg_catalog.pg_attribute a
       where a.attrelid = 'public.inventory_movements'::regclass
         and a.attname = 'binder_id'
         and pg_catalog.col_description(a.attrelid, a.attnum) = marker
     ) then
    if exists (select 1 from public.inventory_movements limit 1) then
      raise exception 'Rollback blocked: inventory_movements contains data';
    end if;
    drop table public.inventory_movements;
  end if;
end
$rollback$;
