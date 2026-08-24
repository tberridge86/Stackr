create or replace function api.search_recognition_candidate_index_scoped(
  p_index_version_id uuid,
  p_embedding jsonb,
  p_language_code text default null,
  p_set_code text default null,
  p_collector_number text default null,
  p_limit integer default 5
)
returns table (
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
  cosine_similarity double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  candidate_model_id text;
  candidate_dimensions integer;
  query_embedding extensions.vector;
begin
  if p_index_version_id is null
    or jsonb_typeof(p_embedding) <> 'array'
    or jsonb_array_length(p_embedding) <> 384
    or p_limit < 1
    or p_limit > 50 then
    raise exception 'Invalid recognition candidate search parameters.' using errcode = '22023';
  end if;

  select model_id, embedding_dimensions
  into candidate_model_id, candidate_dimensions
  from ml.embedding_index_versions
  where id = p_index_version_id
    and status in ('validated', 'active')
    and vector_table_name = 'card_embeddings_dinov2_vits14_384';

  if candidate_model_id <> 'dinov2_vits14' or candidate_dimensions <> 384 then
    raise exception 'Recognition candidate index is not available for benchmarking.' using errcode = 'P0001';
  end if;

  query_embedding := (p_embedding::text)::extensions.vector;

  return query
  with eligible as materialized (
    select
      e.variant_id,
      e.embedding,
      c.canonical_key,
      c.set_id,
      c.set_code,
      c.collector_number,
      c.language_code,
      c.variant_code,
      c.card_native_name,
      c.card_english_display_name
    from ml.card_embeddings_dinov2_vits14_384 e
    join api.catalogue_cards c on c.variant_id = e.variant_id
    where e.model_id = candidate_model_id
      and e.index_version_id = p_index_version_id
      and e.deprecated_at is null
      and (p_language_code is null or e.language_code = p_language_code)
      and (p_set_code is null or pg_catalog.lower(c.set_code) = pg_catalog.lower(p_set_code))
      and (
        p_collector_number is null
        or pg_catalog.regexp_replace(
          pg_catalog.split_part(pg_catalog.lower(c.collector_number), '/', 1),
          '^0+',
          ''
        ) = pg_catalog.regexp_replace(
          pg_catalog.split_part(pg_catalog.lower(p_collector_number), '/', 1),
          '^0+',
          ''
        )
      )
  )
  select
    eligible.canonical_key,
    eligible.variant_id,
    eligible.set_id,
    eligible.set_code,
    eligible.collector_number,
    eligible.language_code,
    eligible.variant_code,
    eligible.card_native_name,
    eligible.card_english_display_name,
    (eligible.embedding OPERATOR(extensions.<=>) query_embedding)::double precision,
    (1.0 - (eligible.embedding OPERATOR(extensions.<=>) query_embedding))::double precision
  from eligible
  order by eligible.embedding OPERATOR(extensions.<=>) query_embedding, eligible.variant_id
  limit p_limit;
end;
$$;

alter function api.search_recognition_candidate_index_scoped(uuid, jsonb, text, text, text, integer)
  set statement_timeout = '60s';

revoke all on function api.search_recognition_candidate_index_scoped(uuid, jsonb, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function api.search_recognition_candidate_index_scoped(uuid, jsonb, text, text, text, integer)
  to service_role;
