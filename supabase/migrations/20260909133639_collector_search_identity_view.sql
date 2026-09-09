set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop function if exists api.catalogue_cards_by_collector(text, text, uuid[], integer);

create or replace view api.catalogue_card_collectors
with (security_invoker = true)
as
select
  c.language_code,
  c.set_id,
  c.printing_id,
  c.variant_id,
  catalog.normalise_stackr_collector_number(c.collector_number) as normalized_collector_number,
  pg_catalog.split_part(catalog.normalise_stackr_collector_number(c.collector_number), '/', 1) as normalized_collector_base
from api.catalogue_cards c;

revoke all on api.catalogue_card_collectors from public, anon, authenticated;
grant select on api.catalogue_card_collectors to service_role;

comment on view api.catalogue_card_collectors is
  'Service-only published collector-number identity lookup used by Stackr search. Normalizes zero padding without scanning arbitrary catalogue rows.';
