-- Give every foreign key inside the controlled catalogue replacement set a
-- usable leading index. PostgreSQL does not create these indexes automatically;
-- without them, deleting a parent can repeatedly scan an already-cleared child
-- table until the promotion statement times out.

set local lock_timeout = '5s';
set local statement_timeout = '5min';

do $migration$
declare
  requirement record;
  index_name text;
  column_sql text;
  child_populated boolean;
begin
  for requirement in
    with selected_tables(table_name) as (
      values
        ('catalog.languages'),
        ('catalog.games'),
        ('catalog.finishes'),
        ('catalog.variant_taxonomy'),
        ('catalog.rarities'),
        ('ingest.sources'),
        ('ingest.import_runs'),
        ('ingest.raw_source_records'),
        ('ingest.data_conflicts'),
        ('ingest.source_health_reports'),
        ('catalog.series'),
        ('catalog.sets'),
        ('catalog.card_concepts'),
        ('catalog.card_printings'),
        ('catalog.card_variants'),
        ('catalog.card_names'),
        ('catalog.sealed_products'),
        ('catalog.sealed_product_variants'),
        ('catalog.catalogue_versions'),
        ('catalog.assets'),
        ('ingest.external_identifiers'),
        ('catalog.catalogue_change_log'),
        ('catalog.catalogue_version_sets'),
        ('catalog.catalogue_version_printings'),
        ('catalog.catalogue_version_variants'),
        ('catalog.catalogue_version_assets'),
        ('catalog.catalogue_version_external_identifiers'),
        ('audit.ingest_merge_decisions')
    ),
    foreign_keys as (
      select
        child_relation.oid as child_relation_oid,
        child_namespace.nspname as child_schema,
        child_relation.relname as child_table,
        array_agg(child_attribute.attname order by key_entry.ordinality)::text[]
          as child_columns
      from pg_constraint constraint_entry
      join pg_class child_relation
        on child_relation.oid = constraint_entry.conrelid
      join pg_namespace child_namespace
        on child_namespace.oid = child_relation.relnamespace
      join pg_class parent_relation
        on parent_relation.oid = constraint_entry.confrelid
      join pg_namespace parent_namespace
        on parent_namespace.oid = parent_relation.relnamespace
      join lateral unnest(constraint_entry.conkey) with ordinality
        as key_entry(child_attribute_number, ordinality) on true
      join pg_attribute child_attribute
        on child_attribute.attrelid = child_relation.oid
       and child_attribute.attnum = key_entry.child_attribute_number
      where constraint_entry.contype = 'f'
        and format('%I.%I', child_namespace.nspname, child_relation.relname)
          in (select table_name from selected_tables)
        and format('%I.%I', parent_namespace.nspname, parent_relation.relname)
          in (select table_name from selected_tables)
      group by child_relation.oid, child_namespace.nspname, child_relation.relname,
        constraint_entry.oid
    ),
    distinct_foreign_keys as (
      select distinct child_relation_oid, child_schema, child_table, child_columns
      from foreign_keys
    )
    select foreign_key.*
    from distinct_foreign_keys foreign_key
    where not exists (
      select 1
      from pg_index index_entry
      join pg_class index_relation
        on index_relation.oid = index_entry.indexrelid
      join pg_am index_method
        on index_method.oid = index_relation.relam
      where index_entry.indrelid = foreign_key.child_relation_oid
        and index_method.amname = 'btree'
        and index_entry.indisvalid
        and index_entry.indisready
        and index_entry.indpred is null
        and (
          select array_agg(index_attribute.attname order by index_key.ordinality)::text[]
          from unnest(index_entry.indkey) with ordinality
            as index_key(attribute_number, ordinality)
          join pg_attribute index_attribute
            on index_attribute.attrelid = foreign_key.child_relation_oid
           and index_attribute.attnum = index_key.attribute_number
          where index_key.ordinality <= cardinality(foreign_key.child_columns)
        ) = foreign_key.child_columns
    )
    order by foreign_key.child_schema, foreign_key.child_table, foreign_key.child_columns
  loop
    index_name := left(
      requirement.child_table || '_' || array_to_string(requirement.child_columns, '_'),
      40
    ) || '_stackr_fk_' || substr(md5(
      requirement.child_schema || '.' || requirement.child_table || ':'
        || array_to_string(requirement.child_columns, ',')
    ), 1, 12);
    select string_agg(format('%I', column_name), ', ' order by ordinal_position)
      into column_sql
    from unnest(requirement.child_columns) with ordinality
      as columns(column_name, ordinal_position);

    execute format(
      'select exists (select 1 from %I.%I limit 1)',
      requirement.child_schema,
      requirement.child_table
    ) into child_populated;
    if child_populated then
      raise exception using
        errcode = '55000',
        message = format(
          'catalogue_transfer_fk_index_requires_online_preparation:%I.%I:%s',
          requirement.child_schema,
          requirement.child_table,
          array_to_string(requirement.child_columns, ',')
        );
    end if;

    execute format(
      'create index if not exists %I on %I.%I (%s)',
      index_name,
      requirement.child_schema,
      requirement.child_table,
      column_sql
    );
  end loop;
end
$migration$;
