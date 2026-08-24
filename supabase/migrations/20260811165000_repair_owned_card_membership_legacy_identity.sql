do $$
declare
  legacy_constraint record;
  legacy_index record;
begin
  -- The 20260702120000 migration originally removed only one index spelling.
  -- Repair installations that recorded that migration while retaining the
  -- legacy four-column identity as a unique constraint or standalone index.
  for legacy_constraint in
    select constraint_record.conname
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.user_card_variants'::regclass
      and constraint_record.contype = 'u'
      and (
        select array_agg(attribute.attname::text order by attribute.attname)
        from unnest(constraint_record.conkey) with ordinality as column_key(attnum, ordinality)
        join pg_attribute attribute
          on attribute.attrelid = constraint_record.conrelid
          and attribute.attnum = column_key.attnum
      ) = array['card_id', 'set_id', 'user_id', 'variant']::text[]
  loop
    execute format(
      'alter table public.user_card_variants drop constraint if exists %I',
      legacy_constraint.conname
    );
  end loop;

  for legacy_index in
    select namespace.nspname as schema_name, index_relation.relname as index_name
    from pg_index index_definition
    join pg_class table_relation on table_relation.oid = index_definition.indrelid
    join pg_class index_relation on index_relation.oid = index_definition.indexrelid
    join pg_namespace namespace on namespace.oid = index_relation.relnamespace
    where table_relation.oid = 'public.user_card_variants'::regclass
      and index_definition.indisunique
      and not index_definition.indisprimary
      and not exists (
        select 1
        from pg_constraint attached_constraint
        where attached_constraint.conindid = index_definition.indexrelid
      )
      and (
        select array_agg(attribute.attname::text order by attribute.attname)
        from unnest(index_definition.indkey) with ordinality as column_key(attnum, ordinality)
        join pg_attribute attribute
          on attribute.attrelid = table_relation.oid
          and attribute.attnum = column_key.attnum
      ) = array['card_id', 'set_id', 'user_id', 'variant']::text[]
  loop
    execute format('drop index if exists %I.%I', legacy_index.schema_name, legacy_index.index_name);
  end loop;
end $$

create unique index if not exists user_card_variants_owned_identity_uidx
  on public.user_card_variants(user_id, card_id, set_id, variant, condition, grade_company, grade)
