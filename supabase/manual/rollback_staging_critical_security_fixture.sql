-- STAGING ONLY. Removes the synthetic containment rehearsal fixture.

do $$
begin
  if not exists (
    select 1
    from public.stackr_staging_fixture_guard
    where singleton and project_ref = 'lmwfhvexfcoyeuoyrlco'
  ) then
    raise exception 'Refusing staging fixture rollback without the expected guard';
  end if;
end;
$$;

drop policy if exists "Users can upload own card scans" on storage.objects;
drop policy if exists "Users can read own card scans" on storage.objects;
drop policy if exists "Users can delete own card scans" on storage.objects;
drop policy if exists "Allow authenticated uploads to card scans" on storage.objects;
drop policy if exists "Allow public read access to card scans" on storage.objects;

do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'card-scans') then
    raise exception 'Empty card-scans through the Supabase Storage API before fixture cleanup';
  end if;

  if exists (select 1 from storage.buckets where id = 'card-scans') then
    raise exception 'Delete card-scans through the Supabase Storage API before fixture cleanup';
  end if;
end;
$$;

drop trigger if exists sync_profile_public_directory_after_write on public.profiles;
drop function if exists public.sync_profile_public_directory();
drop table if exists public.profile_public_directory;
drop table if exists public.market_price_snapshots;

drop policy if exists "Public profiles are viewable" on public.profiles;
drop policy if exists "users can insert own profile" on public.profiles;
drop policy if exists "users can update own profile" on public.profiles;
drop policy if exists "users can view own profile" on public.profiles;
drop policy if exists "Admins can do anything to profiles" on public.profiles;
drop policy if exists "Users can view own private profile" on public.profiles;
drop policy if exists "Users can insert own private profile" on public.profiles;
drop policy if exists "Users can update own private profile" on public.profiles;
drop policy if exists "Admins can manage profiles" on public.profiles;

drop function if exists public.is_admin();
drop table if exists public.profiles;
drop table if exists public.stackr_staging_fixture_guard;
