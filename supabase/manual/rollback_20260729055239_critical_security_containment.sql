-- Conservative rollback for 20260729055239.
--
-- Security boundaries in this migration are deliberately forward-only. This
-- script does not make private scans public, restore broad market access, turn
-- off RLS, or return legacy views to security-definer execution. Correct those
-- controls with a reviewed forward migration if application compatibility
-- requires a change.
--
-- Only unused legacy-compatibility objects carrying this migration's marker
-- are eligible for removal.

do $rollback$
declare
  column_name text;
  marker text := 'Created by 20260729055239 critical security containment.';
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
        if exists (select 1 from public.price_alerts limit 1) then
          raise exception 'Rollback blocked: price_alerts contains data';
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

-- The public-safe profile projection, private scan bucket, restricted market
-- policy, and legacy view/table hardening remain in place by design.
