create or replace function public.admin_binder_directory()
returns table (
  binder_id uuid,
  binder_name text,
  binder_type text,
  is_public boolean,
  owner_user_id uuid,
  owner_email text,
  owner_collector_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Admin only';
  end if;

  return query
  select
    binders.id,
    binders.name,
    binders.type::text,
    binders.is_public,
    binders.user_id,
    profiles.email,
    profiles.collector_name,
    binders.created_at
  from public.binders
  left join public.profiles
    on profiles.id = binders.user_id
  order by binders.created_at desc;
end;
$$;

grant execute on function public.admin_binder_directory() to authenticated;
