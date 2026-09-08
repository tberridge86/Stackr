-- Name lookups were hashing every published variant before returning a small
-- result. Keep publication checks correlated to the indexed name candidates.
-- No catalogue facts, publication state, grants or RLS policies change.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if md5(pg_get_viewdef('api.catalogue_card_names'::regclass, true))
      <> '174f225c879f9dd84f3ad1c7608dcc4f' then
    raise exception 'Catalogue name view changed since verification; review before replacing it';
  end if;
  if not coalesce((select 'security_invoker=true' = any(reloptions)
      from pg_class where oid = 'api.catalogue_card_names'::regclass), false) then
    raise exception 'Catalogue name view must retain security_invoker';
  end if;
end;
$$;

create or replace view api.catalogue_card_names
with (security_invoker = true)
as
select n.id, n.card_concept_id, n.printing_id, n.variant_id,
  n.language_code, n.name_type, n.name, n.normalized_name,
  n.source_confidence, n.updated_at
from catalog.card_names n
where n.deprecated_at is null
  and (
    exists (
      select 1
      from catalog.catalogue_version_variants cvv
      join catalog.catalogue_versions cv on cv.id = cvv.catalogue_version_id
      where cv.status = 'published'
        and cv.deprecated_at is null
        and cvv.variant_id = n.variant_id
      offset 0
    )
    or exists (
      select 1
      from catalog.catalogue_version_printings cvp
      join catalog.catalogue_versions cv on cv.id = cvp.catalogue_version_id
      where cv.status = 'published'
        and cv.deprecated_at is null
        and cvp.printing_id = n.printing_id
      offset 0
    )
  );
