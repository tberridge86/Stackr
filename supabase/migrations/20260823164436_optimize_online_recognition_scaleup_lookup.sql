create or replace function api.search_online_recognition_scaleup_candidates(
  p_embedding jsonb,
  p_language_code text,
  p_set_code text,
  p_collector_number text,
  p_limit integer default 30
)
returns table(
  canonical_key text,
  variant_id uuid,
  set_id uuid,
  set_code text,
  collector_number text,
  language_code text,
  variant_code text,
  card_native_name text,
  card_english_display_name text,
  cosine_distance double precision,
  cosine_similarity double precision,
  retrieval_channel text
)
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  query_embedding extensions.vector;
begin
  if jsonb_typeof(p_embedding) <> 'array'
    or jsonb_array_length(p_embedding) <> 384
    or p_language_code not in ('en', 'ja', 'zh-cn', 'zh-tw')
    or p_limit < 3 or p_limit > 50 then
    raise exception 'Invalid scale-up candidate search parameters.' using errcode = '22023';
  end if;
  query_embedding := (p_embedding::text)::extensions.vector;

  return query
  with distances as materialized (
    select e.variant_id, e.language_code,
      (e.embedding operator(extensions.<=>) query_embedding)::double precision cosine_distance
    from ml.card_embeddings_dinov2_vits14_384 e
    where e.index_version_id = '003dec73-cb69-4ff2-a994-e559d9791a56'
      and e.deprecated_at is null
  ), visual_global as (
    select d.variant_id, d.cosine_distance, 'visual_global'::text channel
    from distances d order by d.cosine_distance, d.variant_id limit 15
  ), visual_language as (
    select d.variant_id, d.cosine_distance, 'visual_language'::text channel
    from distances d where d.language_code = p_language_code
    order by d.cosine_distance, d.variant_id limit 15
  ), structured as (
    select d.variant_id, d.cosine_distance, 'structured_set_collector'::text channel
    from distances d
    join api.catalogue_cards c on c.variant_id = d.variant_id
    where d.language_code = p_language_code
      and (p_set_code is null or lower(c.set_code) = lower(p_set_code))
      and (p_collector_number is null or lower(c.collector_number) = lower(p_collector_number))
    order by d.cosine_distance, d.variant_id limit 15
  ), combined as (
    select * from visual_global union all select * from visual_language union all select * from structured
  ), deduplicated as (
    select distinct on (combined.variant_id) combined.*
    from combined
    order by combined.variant_id, combined.cosine_distance,
      case combined.channel when 'structured_set_collector' then 0 when 'visual_language' then 1 else 2 end
  )
  select c.canonical_key, c.variant_id, c.set_id, c.set_code, c.collector_number,
    c.language_code, c.variant_code, c.card_native_name, c.card_english_display_name,
    d.cosine_distance, 1.0 - d.cosine_distance, d.channel
  from deduplicated d
  join api.catalogue_cards c on c.variant_id = d.variant_id
  order by d.cosine_distance, d.variant_id
  limit p_limit;
end;
$$;

revoke all on function api.search_online_recognition_scaleup_candidates(jsonb, text, text, text, integer) from public, anon, authenticated;
grant execute on function api.search_online_recognition_scaleup_candidates(jsonb, text, text, text, integer) to service_role;
