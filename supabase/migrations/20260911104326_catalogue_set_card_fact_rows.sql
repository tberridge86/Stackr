create or replace function api.catalogue_set_card_fact_rows(
  p_set_id uuid,
  p_language_code text default null,
  p_after_variant_id uuid default null,
  p_limit integer default 120
)
returns table(card_row jsonb)
language sql
stable
security invoker
set search_path = ''
as $function$
with selected as materialized (
  select c.*
  from api.catalogue_cards c
  where c.set_id = p_set_id
    and (p_language_code is null or c.language_code = p_language_code)
    and (p_after_variant_id is null or c.variant_id > p_after_variant_id)
  order by c.variant_id
  limit least(greatest(coalesce(p_limit, 120), 1), 500) + 1
)
select to_jsonb(s) as card_row
from selected s
order by s.variant_id;
$function$;

revoke all on function api.catalogue_set_card_fact_rows(uuid, text, uuid, integer) from public;
revoke all on function api.catalogue_set_card_fact_rows(uuid, text, uuid, integer) from anon;
revoke all on function api.catalogue_set_card_fact_rows(uuid, text, uuid, integer) from authenticated;
grant execute on function api.catalogue_set_card_fact_rows(uuid, text, uuid, integer) to service_role;
