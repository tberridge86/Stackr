create index if not exists assets_recognition_fingerprint_lookup_idx
  on catalog.assets (
    variant_id,
    ((content_sha256 ~ '^[0-9a-f]{64}$')) desc,
    ((width is not null and height is not null and width > 0 and height > 0)) desc,
    ((width::bigint * height::bigint)) desc,
    last_verified_at desc,
    id
  )
  where asset_type = 'card_image'
    and recognition_reference_eligible
    and asset_visibility = 'public_catalogue'
    and publicly_servable
    and rights_status = 'approved'
    and permission_status = 'approved'
    and retention_status = 'active'
    and deleted_at is null
    and deprecated_at is null
    and unavailable_reason is null
    and storage_provider = 'supabase_storage'
    and storage_bucket is not null
    and storage_key is not null;

create or replace function api.list_recognition_fingerprint_assets(
  p_variant_ids uuid[]
)
returns table (
  reference_asset_id uuid,
  variant_id uuid,
  content_sha256 text,
  perceptual_hash text,
  width integer,
  height integer,
  last_verified_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_variant_ids is null
    or cardinality(p_variant_ids) < 1
    or cardinality(p_variant_ids) > 500 then
    raise exception 'p_variant_ids must contain between 1 and 500 variant IDs.'
      using errcode = '22023';
  end if;

  return query
  select
    selected.id,
    requested.variant_id,
    selected.content_sha256,
    selected.perceptual_hash,
    selected.width,
    selected.height,
    selected.last_verified_at
  from (
    select distinct requested_id as variant_id
    from pg_catalog.unnest(p_variant_ids) as supplied(requested_id)
  ) requested
  cross join lateral (
    select
      a.id,
      a.content_sha256,
      a.perceptual_hash,
      a.width,
      a.height,
      a.last_verified_at
    from catalog.assets a
    join catalog.card_variants v
      on v.id = a.variant_id
     and v.deprecated_at is null
    join catalog.card_printings p
      on p.id = v.printing_id
     and p.deprecated_at is null
    join catalog.sets s
      on s.id = p.set_id
     and s.deprecated_at is null
    where a.variant_id = requested.variant_id
      and a.asset_type = 'card_image'
      and a.recognition_reference_eligible
      and a.asset_visibility = 'public_catalogue'
      and a.publicly_servable
      and a.rights_status = 'approved'
      and a.permission_status = 'approved'
      and a.retention_status = 'active'
      and a.deleted_at is null
      and a.deprecated_at is null
      and a.unavailable_reason is null
      and a.storage_provider = 'supabase_storage'
      and a.storage_bucket is not null
      and a.storage_key is not null
      and coalesce(p.language_code, s.language_code) in ('en', 'ja', 'zh-cn', 'zh-tw')
      and exists (
        select 1
        from catalog.catalogue_version_variants cvv
        join catalog.catalogue_versions cv
          on cv.id = cvv.catalogue_version_id
         and cv.status = 'published'
         and cv.deprecated_at is null
        where cvv.variant_id = v.id
      )
    order by
      (a.content_sha256 ~ '^[0-9a-f]{64}$') desc,
      (a.width is not null and a.height is not null and a.width > 0 and a.height > 0) desc,
      (a.width::bigint * a.height::bigint) desc nulls last,
      a.last_verified_at desc nulls last,
      a.id
    limit 1
  ) selected;
end;
$$;

revoke all on function api.list_recognition_fingerprint_assets(uuid[])
  from public;
grant execute on function api.list_recognition_fingerprint_assets(uuid[])
  to anon, authenticated, service_role;

comment on function api.list_recognition_fingerprint_assets(uuid[]) is
  'Returns one deterministic, publicly eligible recognition reference asset for each of at most 500 requested launch-language variants.';
