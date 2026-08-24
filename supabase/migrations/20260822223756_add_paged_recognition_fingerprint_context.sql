create index if not exists card_names_active_variant_name_idx
  on catalog.card_names (variant_id, name)
  where variant_id is not null and deprecated_at is null;

create index if not exists card_names_active_printing_name_idx
  on catalog.card_names (printing_id, name)
  where printing_id is not null and deprecated_at is null;

create or replace function api.list_recognition_fingerprint_context(
  p_language_code text,
  p_after_variant_id uuid default null,
  p_limit integer default 500
)
returns table (
  variant_id uuid,
  printing_id uuid,
  language_code text,
  set_code text,
  set_native_name text,
  set_english_display_name text,
  collector_number text,
  card_native_name text,
  card_english_display_name text,
  variant_code text,
  finish_code text,
  rarity_code text,
  aliases text[],
  reference_asset_id uuid,
  reference_image_sha256 text,
  reference_image_perceptual_hash text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_language_code not in ('en', 'ja', 'zh-cn', 'zh-tw') then
    raise exception 'p_language_code must be a launch language.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'p_limit must be between 1 and 500.' using errcode = '22023';
  end if;

  return query
  select
    v.id,
    p.id,
    v.language_code,
    s.set_code,
    s.native_name,
    s.english_display_name,
    p.collector_number,
    p.native_name,
    p.english_display_name,
    v.variant_code,
    v.finish_code,
    r.code,
    coalesce(names.aliases, '{}'::text[]),
    reference.id,
    reference.content_sha256,
    reference.perceptual_hash
  from catalog.card_variants v
  join catalog.card_printings p
    on p.id = v.printing_id
   and p.deprecated_at is null
  join catalog.sets s
    on s.id = p.set_id
   and s.deprecated_at is null
  left join catalog.rarities r on r.id = p.rarity_id
  left join lateral (
    select pg_catalog.array_agg(distinct n.name order by n.name) as aliases
    from catalog.card_names n
    where n.deprecated_at is null
      and (n.variant_id = v.id or n.printing_id = p.id)
  ) names on true
  left join lateral (
    select
      a.id,
      a.content_sha256,
      a.perceptual_hash
    from catalog.assets a
    where a.variant_id = v.id
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
    order by
      (a.content_sha256 ~ '^[0-9a-f]{64}$') desc,
      (a.width is not null and a.height is not null and a.width > 0 and a.height > 0) desc,
      (a.width::bigint * a.height::bigint) desc nulls last,
      a.last_verified_at desc nulls last,
      a.id
    limit 1
  ) reference on true
  where v.language_code = p_language_code
    and v.deprecated_at is null
    and (p_after_variant_id is null or v.id > p_after_variant_id)
    and exists (
      select 1
      from catalog.catalogue_version_variants cvv
      join catalog.catalogue_versions cv
        on cv.id = cvv.catalogue_version_id
       and cv.status = 'published'
       and cv.deprecated_at is null
      where cvv.variant_id = v.id
        and cvv.language_code = p_language_code
    )
  order by v.id
  limit p_limit;
end;
$$;

revoke all on function api.list_recognition_fingerprint_context(text, uuid, integer)
  from public;
grant execute on function api.list_recognition_fingerprint_context(text, uuid, integer)
  to anon, authenticated, service_role;

comment on function api.list_recognition_fingerprint_context(text, uuid, integer) is
  'Pages immutable public recognition metadata, aliases, and one canonical eligible reference hash for a launch language.';
