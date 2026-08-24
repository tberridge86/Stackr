create or replace function api.search_recognition_candidate_index(
  p_index_version_id uuid,
  p_embedding jsonb,
  p_language_code text default null,
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
  perform pg_catalog.set_config('hnsw.iterative_scan', 'strict_order', true);
  perform pg_catalog.set_config('hnsw.ef_search', '64', true);

  return query execute pg_catalog.format(
    $search$
      with nearest as materialized (
        select
          e.variant_id,
          (e.embedding OPERATOR(extensions.<=>) %1$L::extensions.vector)::double precision as cosine_distance
        from ml.card_embeddings_dinov2_vits14_384 e
        where e.model_id = $1
          and e.index_version_id = $2
          and e.deprecated_at is null
          and ($3::text is null or e.language_code = $3::text)
        order by e.embedding OPERATOR(extensions.<=>) %1$L::extensions.vector
        limit $4
      )
      select
        c.canonical_key,
        c.variant_id,
        c.set_id,
        c.set_code,
        c.collector_number,
        c.language_code,
        c.variant_code,
        c.card_native_name,
        c.card_english_display_name,
        nearest.cosine_distance,
        1.0 - nearest.cosine_distance
      from nearest
      join api.catalogue_cards c on c.variant_id = nearest.variant_id
      order by nearest.cosine_distance asc, nearest.variant_id asc
    $search$,
    query_embedding::text
  ) using candidate_model_id, p_index_version_id, p_language_code, p_limit;
end;
$$;

alter function api.search_recognition_candidate_index(uuid, jsonb, text, integer)
  set statement_timeout = '60s';

revoke all on function api.search_recognition_candidate_index(uuid, jsonb, text, integer)
  from public, anon, authenticated;
grant execute on function api.search_recognition_candidate_index(uuid, jsonb, text, integer)
  to service_role;
