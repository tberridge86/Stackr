set local lock_timeout = '5s';
set local statement_timeout = '5min';

do $migration$
declare
  required_constraint record;
  current_constraint record;
begin
  for required_constraint in
    select *
    from (values
      ('catalog', 'series', 'series_corrected_by_series_id_fkey', 'corrected_by_series_id', 'a'),
      ('catalog', 'sets', 'sets_corrected_by_set_id_fkey', 'corrected_by_set_id', 'a'),
      ('catalog', 'card_concepts', 'card_concepts_corrected_by_concept_id_fkey', 'corrected_by_concept_id', 'a'),
      ('catalog', 'card_printings', 'card_printings_corrected_by_printing_id_fkey', 'corrected_by_printing_id', 'a'),
      ('catalog', 'card_variants', 'card_variants_corrected_by_variant_id_fkey', 'corrected_by_variant_id', 'a'),
      ('catalog', 'card_variants', 'card_variants_same_artwork_as_variant_id_fkey', 'same_artwork_as_variant_id', 'n'),
      ('catalog', 'sealed_products', 'sealed_products_corrected_by_product_id_fkey', 'corrected_by_product_id', 'a'),
      ('catalog', 'sealed_product_variants', 'sealed_product_variants_corrected_by_variant_id_fkey', 'corrected_by_variant_id', 'a'),
      ('catalog', 'catalogue_versions', 'catalogue_versions_superseded_by_version_id_fkey', 'superseded_by_version_id', 'a')
    ) as required(
      schema_name,
      table_name,
      constraint_name,
      child_column,
      delete_action
    )
  loop
    select
      constraint_entry.condeferrable,
      constraint_entry.condeferred,
      constraint_entry.convalidated,
      constraint_entry.conrelid = constraint_entry.confrelid as self_referential,
      constraint_entry.confdeltype::text as delete_action,
      array(
        select child_attribute.attname
        from unnest(constraint_entry.conkey) with ordinality
          as child_key(attribute_number, ordinal)
        join pg_attribute child_attribute
          on child_attribute.attrelid = constraint_entry.conrelid
         and child_attribute.attnum = child_key.attribute_number
        order by child_key.ordinal
      )::text[] as child_columns
    into current_constraint
    from pg_constraint constraint_entry
    join pg_class child_relation
      on child_relation.oid = constraint_entry.conrelid
    join pg_namespace child_namespace
      on child_namespace.oid = child_relation.relnamespace
    where constraint_entry.contype = 'f'
      and child_namespace.nspname = required_constraint.schema_name
      and child_relation.relname = required_constraint.table_name
      and constraint_entry.conname = required_constraint.constraint_name;

    if not found then
      raise exception using
        message = format(
          'catalogue_self_foreign_key_missing:%I.%I.%I',
          required_constraint.schema_name,
          required_constraint.table_name,
          required_constraint.constraint_name
        );
    end if;
    if not current_constraint.convalidated
       or not current_constraint.self_referential
       or current_constraint.child_columns
         is distinct from array[required_constraint.child_column]::text[]
       or current_constraint.delete_action is distinct from required_constraint.delete_action
    then
      raise exception using
        message = format(
          'catalogue_self_foreign_key_invalid:%I.%I.%I',
          required_constraint.schema_name,
          required_constraint.table_name,
          required_constraint.constraint_name
        );
    end if;

    if not current_constraint.condeferrable or current_constraint.condeferred then
      execute format(
        'alter table %I.%I alter constraint %I deferrable initially immediate',
        required_constraint.schema_name,
        required_constraint.table_name,
        required_constraint.constraint_name
      );
    end if;
  end loop;
end
$migration$;
