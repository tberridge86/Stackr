do $$
declare
  public_directory_columns text[];
  market_policy text;
  bucket_record record;
  scan_upload_check text;
  scan_read_policy text;
  scan_delete_policy text;
begin
  if not exists (
    select 1
    from public.stackr_staging_fixture_guard
    where singleton and project_ref = 'lmwfhvexfcoyeuoyrlco'
  ) then
    raise exception 'Expected staging fixture guard is missing';
  end if;

  select array_agg(column_name order by ordinal_position)
  into public_directory_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profile_public_directory';

  if public_directory_columns is null then
    raise exception 'profile_public_directory was not created';
  end if;

  if public_directory_columns && array[
    'email',
    'expo_push_token',
    'role',
    'stripe_account_id'
  ] then
    raise exception 'Public profile directory exposes a private column';
  end if;

  if (select count(*) from public.profile_public_directory) <> 2 then
    raise exception 'Profile directory backfill count does not match fixture';
  end if;

  if has_table_privilege('anon', 'public.profiles', 'select') then
    raise exception 'Anonymous users can still select from private profiles';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Public profiles are viewable'
  ) then
    raise exception 'Legacy public profile policy still exists';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can view own private profile'
  ) then
    raise exception 'Owner-only private profile policy is missing';
  end if;

  select qual
  into market_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'market_price_snapshots'
    and policyname = 'Public or owner market snapshots are readable';

  if market_policy is null
    or lower(market_policy) not like '%user_id is null%'
    or lower(market_policy) not like '%auth.uid()%'
  then
    raise exception 'Owner-scoped market policy is missing or malformed';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'market_price_snapshots'
      and policyname = 'Allow authenticated users to read market snapshots'
  ) then
    raise exception 'Permissive authenticated market policy still exists';
  end if;

  select public, file_size_limit, allowed_mime_types
  into bucket_record
  from storage.buckets
  where id = 'card-scans';

  if not found then
    raise exception 'card-scans bucket is missing';
  end if;

  if bucket_record.public
    or bucket_record.file_size_limit <> 5242880
    or bucket_record.allowed_mime_types is null
    or bucket_record.allowed_mime_types <> array[
      'image/jpeg',
      'image/png',
      'image/webp'
    ]::text[]
  then
    raise exception 'Private scan bucket controls are not active';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Allow public read access to card scans'
  ) then
    raise exception 'Public scan read policy still exists';
  end if;

  select with_check
  into scan_upload_check
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'Users can upload own card scans';

  select qual
  into scan_read_policy
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'Users can read own card scans';

  select qual
  into scan_delete_policy
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'Users can delete own card scans';

  if scan_upload_check is null
    or lower(scan_upload_check) not like '%card-scans%'
    or lower(scan_upload_check) not like '%split_part%'
    or lower(scan_upload_check) not like '%auth.uid()%'
  then
    raise exception 'Owner-prefixed scan upload policy is missing or malformed';
  end if;

  if scan_read_policy is null
    or lower(scan_read_policy) not like '%card-scans%'
    or lower(scan_read_policy) not like '%split_part%'
    or lower(scan_read_policy) not like '%owner_id%'
    or lower(scan_read_policy) not like '%auth.uid()%'
  then
    raise exception 'Owner-scoped scan read policy is missing or malformed';
  end if;

  if scan_delete_policy is null
    or lower(scan_delete_policy) not like '%card-scans%'
    or lower(scan_delete_policy) not like '%split_part%'
    or lower(scan_delete_policy) not like '%owner_id%'
    or lower(scan_delete_policy) not like '%auth.uid()%'
  then
    raise exception 'Owner-scoped scan delete policy is missing or malformed';
  end if;
end;
$$;

select json_build_object(
  'ok', true,
  'profile_directory_rows', (select count(*) from public.profile_public_directory),
  'anonymous_private_profile_access', has_table_privilege('anon', 'public.profiles', 'select'),
  'market_snapshot_rows', (select count(*) from public.market_price_snapshots),
  'card_scans_private', (select not public from storage.buckets where id = 'card-scans')
) as containment_assertions;
