-- Emergency rollback for finalize_profile_privacy_cutover.sql.

drop policy if exists "Users can view own private profile" on public.profiles;
drop policy if exists "Users can insert own private profile" on public.profiles;
drop policy if exists "Users can update own private profile" on public.profiles;
drop policy if exists "Admins can manage profiles" on public.profiles;

create policy "Public profiles are viewable"
  on public.profiles for select to public using (true);
create policy "users can insert own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);
create policy "users can update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id);
create policy "users can view own profile"
  on public.profiles for select to authenticated
  using (auth.uid() = id);
create policy "Admins can do anything to profiles"
  on public.profiles for all to authenticated
  using (is_admin()) with check (is_admin());

grant select on table public.profiles to anon;
grant select, insert, update, delete on table public.profiles to authenticated;
