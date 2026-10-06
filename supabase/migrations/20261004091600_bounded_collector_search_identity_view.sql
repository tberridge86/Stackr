-- `collectorIdentityLookup` is enabled for the v1 backend, but legacy
-- environments did not receive the old collector view migration. Recreate it
-- from the physical published relations, rather than from api.catalogue_cards,
-- so exact set/number search is both deploy-safe and bounded by the indexed
-- collector predicates.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace view api.catalogue_card_collectors
with (security_invoker = true)
as
select
  v.language_code,
  p.set_id,
  p.id as printing_id,
  v.id as variant_id,
  api.normalized_price_collector(p.collector_number) as normalized_collector_number,
  pg_catalog.split_part(api.normalized_price_collector(p.collector_number), '/', 1) as normalized_collector_base
from catalog.catalogue_version_variants cvv
join catalog.catalogue_versions cv on cv.id=cvv.catalogue_version_id
  and cv.status='published' and cv.deprecated_at is null
join catalog.card_variants v on v.id=cvv.variant_id and v.deprecated_at is null
join catalog.card_printings p on p.id=v.printing_id and p.deprecated_at is null
join catalog.sets s on s.id=p.set_id and s.deprecated_at is null
join catalog.languages language on language.code=v.language_code;

revoke all on api.catalogue_card_collectors from public, anon, authenticated;
grant select on api.catalogue_card_collectors to service_role;

comment on view api.catalogue_card_collectors is
  'Service-only exact published collector identity lookup for Stackr v1 search; normalized with the indexed price-guide collector function.';
