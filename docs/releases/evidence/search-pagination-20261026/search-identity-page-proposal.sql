-- LOCAL PROPOSAL ONLY. Not registered as a migration and not applied remotely.
-- Select canonical identities before hydration. No new tables, indexes, schedules or jobs.
begin;
create or replace function api.catalogue_search_identity_page_v1(
  p_selector jsonb,
  p_after jsonb default null,
  p_limit integer default 50,
  p_expected_revision text default null,
  p_exclude_selector jsonb default null
) returns jsonb
language sql stable security invoker set search_path = ''
as $search$
with
selectors as (
  select 'include'::text label, p_selector body
  union all
  select 'exclude', p_exclude_selector where p_exclude_selector is not null
),
settings as (
  select label, body, body->>'kind' kind, nullif(body->>'language', '') language,
    array(select jsonb_array_elements_text(coalesce(body->'setIds', '[]'::jsonb)))::uuid[] set_ids,
    array(select jsonb_array_elements_text(coalesce(body->'nameTypes', '[]'::jsonb))) name_types
  from selectors
),
name_clauses as (
  select s.*, clause.body clause,
    array(select jsonb_array_elements_text(coalesce(clause.body->'setIds', '[]'::jsonb)))::uuid[] clause_set_ids
  from settings s
  cross join lateral jsonb_array_elements(coalesce(s.body->'clauses', jsonb_build_array(s.body))) clause(body)
  where s.kind in ('name', 'fuzzyName')
),
-- Match through existing name indexes before resolving printing language.
-- Variant publication is checked at canonical eligibility; printing-only names
-- also retain their explicit published-printing membership requirement.
matching_names as (
  select s.label, s.language, s.set_ids, s.clause_set_ids, n.id name_id,
    n.printing_id, n.variant_id, n.name, n.name_type,
    s.clause->>'matchedSetCode' matched_set_code
  from name_clauses s
  join catalog.card_names n on n.normalized_name = s.clause->>'normalized'
    and n.name_type = any(s.name_types)
  where s.kind = 'name' and n.deprecated_at is null and (n.variant_id is not null or exists (
    select 1 from catalog.catalogue_version_printings cvp
    join catalog.catalogue_versions cv on cv.id = cvp.catalogue_version_id
    where cvp.printing_id = n.printing_id and cv.status = 'published' and cv.deprecated_at is null
    offset 0
  ))
  union all
  select s.label, s.language, s.set_ids, s.clause_set_ids, n.id name_id,
    n.printing_id, n.variant_id, n.name, n.name_type,
    s.clause->>'matchedSetCode' matched_set_code
  from name_clauses s
  join catalog.card_names n on n.normalized_name ilike (s.body->'patterns'->>0)
    and n.normalized_name ilike all (array(select jsonb_array_elements_text(s.body->'patterns')))
  where s.kind = 'fuzzyName' and n.deprecated_at is null and (n.variant_id is not null or exists (
    select 1 from catalog.catalogue_version_printings cvp
    join catalog.catalogue_versions cv on cv.id = cvp.catalogue_version_id
    where cvp.printing_id = n.printing_id and cv.status = 'published' and cv.deprecated_at is null
    offset 0
  ))
),
name_keys as (
  -- A variant-specific name must never expand to sibling physical finishes.
  select n.label, 'card'::text entity_type, v.id entity_id, n.name_id,
    n.name matched_name, n.name_type matched_name_type, n.matched_set_code
  from matching_names n
  join catalog.card_variants v on v.id = n.variant_id
  join catalog.card_printings p on p.id = v.printing_id
  where (n.language is null or v.language_code = n.language)
    and (cardinality(n.set_ids) = 0 or p.set_id = any(n.set_ids))
    and (cardinality(n.clause_set_ids) = 0 or p.set_id = any(n.clause_set_ids))
  union all
  select n.label, 'card', v.id, n.name_id, n.name, n.name_type, n.matched_set_code
  from matching_names n
  join catalog.card_variants v on v.printing_id = n.printing_id
  join catalog.card_printings p on p.id = v.printing_id
  where n.variant_id is null
    and (n.language is null or p.language_code = n.language)
    and (cardinality(n.set_ids) = 0 or p.set_id = any(n.set_ids))
    and (cardinality(n.clause_set_ids) = 0 or p.set_id = any(n.clause_set_ids))
),
external_matches as (
  select s.label, e.*
  from settings s join api.catalogue_external_identifiers e on e.external_id = s.body->>'reference'
  where s.kind = 'external' and (s.language is null or e.language_code = s.language)
),
other_keys as (
  select s.label, 'card'::text entity_type, v.id entity_id
  from settings s join catalog.card_variants v on (
    v.canonical_key = s.body->>'reference'
    or v.id = case when (s.body->>'reference') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (s.body->>'reference')::uuid end
    or v.printing_id = case when (s.body->>'reference') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (s.body->>'reference')::uuid end
  ) where s.kind = 'canonical'
  union all
  select e.label, 'card', e.variant_id from external_matches e where e.variant_id is not null
  union all
  select e.label, 'card', v.id from external_matches e
  join catalog.card_variants v on v.printing_id = e.printing_id where e.variant_id is null
  union all
  select e.label, 'set', e.set_id from external_matches e where e.set_id is not null
  union all
  select s.label, 'card', c.variant_id from settings s
  join api.catalogue_card_collectors c on (
    (position('/' in (s.body->>'collectorNumber')) > 0
      and c.normalized_collector_number = s.body->>'collectorNumber')
    or (position('/' in (s.body->>'collectorNumber')) = 0
      and c.normalized_collector_base = s.body->>'collectorNumber')
  ) where s.kind = 'collector'
    and (s.language is null or c.language_code = s.language)
    and (cardinality(s.set_ids) = 0 or c.set_id = any(s.set_ids))
  union all
  select s.label, 'card', v.id from settings s
  cross join lateral jsonb_to_recordset(coalesce(s.body->'nativeNames', '[]'::jsonb)) n(language text, "nativeName" text)
  join catalog.card_printings p on p.native_name = n."nativeName"
  join catalog.card_variants v on v.printing_id = p.id and v.language_code = n.language
  where s.kind = 'nativeTranslation'
),
all_keys as (
  select * from name_keys
  union all
  select label, entity_type, entity_id, null::uuid, null::text, null::text, null::text from other_keys
),
eligible_keys as (
  select k.* from all_keys k join settings s on s.label = k.label
  where (p_after is null or (k.entity_type, k.entity_id) >
    (p_after->>'entityType', (p_after->>'entityId')::uuid))
  and ((k.entity_type = 'card' and exists (
    select 1 from api.catalogue_cards c where c.variant_id = k.entity_id
      and (s.language is null or c.language_code = s.language)
      and (cardinality(s.set_ids) = 0 or c.set_id = any(s.set_ids))
  )) or (k.entity_type = 'set' and exists (
    select 1 from api.catalogue_sets c where c.set_id = k.entity_id
      and (s.language is null or c.language_code = s.language)
      and (cardinality(s.set_ids) = 0 or c.set_id = any(s.set_ids))
  )))
),
excluded_keys as materialized (
  select distinct entity_type, entity_id from eligible_keys where label = 'exclude'
),
unique_keys as (
  select distinct on (i.entity_type, i.entity_id) i.*
  from eligible_keys i left join excluded_keys e
    on e.entity_type = i.entity_type and e.entity_id = i.entity_id
  where i.label = 'include' and e.entity_id is null
  order by i.entity_type, i.entity_id, i.name_id nulls last
),
revision as (
  select md5(jsonb_build_object(
    'algorithm', md5(pg_get_functiondef('api.catalogue_search_identity_page_v1(jsonb,jsonb,integer,text,jsonb)'::regprocedure)),
    'versions', coalesce((select jsonb_agg(jsonb_build_array(v.id, v.version_key, extract(epoch from v.updated_at),
      v.max_change_sequence) order by v.id) from api.published_catalogue_versions v), '[]'::jsonb),
    'sequence', coalesce((select d.change_sequence from api.catalogue_delta_changes d
      order by d.change_sequence desc limit 1), 0)
  )::text) value
),
page_keys as materialized (
  select k.* from unique_keys k cross join revision r
  where (p_expected_revision is null or p_expected_revision = r.value)
    and (p_after is null or (k.entity_type, k.entity_id) >
      (p_after->>'entityType', (p_after->>'entityId')::uuid))
  order by k.entity_type, k.entity_id
  limit greatest(1, least(100, p_limit)) + 1
),
page as (
  select k.* from page_keys k order by k.entity_type, k.entity_id
  limit greatest(1, least(100, p_limit))
),
hydrated as (
  select p.*, c.body card_row, s.body set_row from page p
  left join lateral (
    select to_jsonb(c) body from api.catalogue_cards c
    where p.entity_type = 'card' and c.variant_id = p.entity_id
    order by c.catalogue_version_id desc limit 1
  ) c on true
  left join lateral (
    select to_jsonb(s) body from api.catalogue_sets s
    where p.entity_type = 'set' and s.set_id = p.entity_id
    order by s.catalogue_version_id desc limit 1
  ) s on true
)
select jsonb_build_object(
  'revision', r.value,
  'hasMore', (select count(*) > greatest(1, least(100, p_limit)) from page_keys),
  'entries', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'entityType', h.entity_type, 'entityId', h.entity_id,
    'cardRow', h.card_row, 'setRow', h.set_row,
    'matchedName', h.matched_name, 'matchedNameType', h.matched_name_type,
    'matchedSetCode', h.matched_set_code
  )) order by h.entity_type, h.entity_id) from hydrated h), '[]'::jsonb)
) from revision r;
$search$;
revoke all on function api.catalogue_search_identity_page_v1(jsonb,jsonb,integer,text,jsonb) from public, anon, authenticated;
grant execute on function api.catalogue_search_identity_page_v1(jsonb,jsonb,integer,text,jsonb) to service_role;
commit;
