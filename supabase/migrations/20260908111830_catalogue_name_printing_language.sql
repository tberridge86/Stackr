-- The language of an English search name can differ from the card's language.
-- Expose both so English aliases never turn an English-card search into CJK.
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$
begin
  if md5(pg_get_viewdef('api.catalogue_card_names'::regclass, true))
      <> '103211bd81855df5a6acd6c5f840774d' then
    raise exception 'Catalogue name view changed since verification';
  end if;
end;
$$;
create or replace view api.catalogue_card_names
with (security_invoker = true)
as
select n.id, n.card_concept_id, n.printing_id, n.variant_id,
  n.language_code, n.name_type, n.name, n.normalized_name,
  n.source_confidence, n.updated_at,
  coalesce(v.language_code, p.language_code) as printing_language_code
from catalog.card_names n
left join catalog.card_variants v on v.id = n.variant_id
left join catalog.card_printings p on p.id = n.printing_id
where n.deprecated_at is null
  and (
    exists (
      select 1 from catalog.catalogue_version_variants cvv
      join catalog.catalogue_versions cv on cv.id = cvv.catalogue_version_id
      where cv.status = 'published' and cv.deprecated_at is null
        and cvv.variant_id = n.variant_id
      offset 0
    )
    or exists (
      select 1 from catalog.catalogue_version_printings cvp
      join catalog.catalogue_versions cv on cv.id = cvp.catalogue_version_id
      where cv.status = 'published' and cv.deprecated_at is null
        and cvp.printing_id = n.printing_id
      offset 0
    )
  );
