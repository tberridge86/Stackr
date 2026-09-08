-- Bounded service-only bridge for exact owner TCGdex normal-price refreshes.
-- It exposes only provider card aliases already present in the single current
-- published language snapshot; ingest/catalog schemas remain private to PostgREST.
create or replace function api.approved_tcgdex_variant_aliases(
  p_variant_id uuid,
  p_language_code text
)
returns table (external_id text)
language sql
stable
strict
security definer
set search_path = ''
as $$
  with current_versions as materialized (
    select version.id
    from catalog.catalogue_versions as version
    where version.language_code = p_language_code
      and version.status = 'published'
      and version.deprecated_at is null
      and version.superseded_by_version_id is null
  ), verified_version as materialized (
    select version.id
    from current_versions as version
    where (select count(*) from current_versions) = 1
  )
  select cvei.external_id
  from catalog.catalogue_version_external_identifiers as cvei
  join verified_version as version
    on version.id = cvei.catalogue_version_id
  join catalog.catalogue_version_variants as membership
    on membership.catalogue_version_id = version.id
   and membership.variant_id = cvei.variant_id
   and membership.language_code = p_language_code
  join ingest.sources as source
    on source.id = cvei.source_id
  where cvei.variant_id = p_variant_id
    and cvei.language_code = p_language_code
    and cvei.source_entity_type = 'card'
    and source.code = 'tcgdex'
    and source.active
    and source.licence_status = 'approved'
    and source.deprecated_at is null
  order by cvei.external_id
  limit 101;
$$;

revoke all on function api.approved_tcgdex_variant_aliases(uuid, text)
  from public, anon, authenticated;
grant execute on function api.approved_tcgdex_variant_aliases(uuid, text)
  to service_role;

comment on function api.approved_tcgdex_variant_aliases(uuid, text) is
  'Service-only bounded lookup of approved, current published TCGdex card aliases for one canonical variant and language. Does not expose ingest or catalog schemas.';
