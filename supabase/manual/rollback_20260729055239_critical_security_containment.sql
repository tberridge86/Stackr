-- Emergency rollback only. This restores the pre-audit access model, including
-- the public scan bucket and public full-profile reads. Prefer rolling forward.

drop policy if exists "Users can upload own card scans" on storage.objects;
drop policy if exists "Users can read own card scans" on storage.objects;
drop policy if exists "Users can delete own card scans" on storage.objects;

update storage.buckets
set public = true, file_size_limit = null, allowed_mime_types = null
where id = 'card-scans';

create policy "Allow authenticated uploads to card scans"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'card-scans');
create policy "Allow public read access to card scans"
  on storage.objects for select to public
  using (bucket_id = 'card-scans');

drop policy if exists "Public or owner market snapshots are readable"
  on public.market_price_snapshots;
create policy "Market price snapshots are readable"
  on public.market_price_snapshots for select to public
  using (user_id is null or auth.uid() = user_id);
create policy "Allow authenticated users to read market snapshots"
  on public.market_price_snapshots for select to authenticated
  using (true);

drop trigger if exists sync_profile_public_directory_after_write on public.profiles;
drop function if exists public.sync_profile_public_directory();
drop table if exists public.profile_public_directory;
