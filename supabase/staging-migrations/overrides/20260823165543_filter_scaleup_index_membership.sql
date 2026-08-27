create or replace function api.filter_online_recognition_indexed_variants(p_variant_ids uuid[])
returns table(variant_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct e.variant_id
  from ml.card_embeddings_dinov2_vits14_384 e
  where e.index_version_id = '003dec73-cb69-4ff2-a994-e559d9791a56'
    and e.deprecated_at is null
    and e.variant_id = any(p_variant_ids)
  order by e.variant_id;
$$;

revoke all on function api.filter_online_recognition_indexed_variants(uuid[]) from public, anon, authenticated;
grant execute on function api.filter_online_recognition_indexed_variants(uuid[]) to service_role;
