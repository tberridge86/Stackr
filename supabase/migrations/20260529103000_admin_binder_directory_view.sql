create or replace view public.admin_binder_directory_view as
select
  binders.id as binder_id,
  binders.name as binder_name,
  binders.type::text as binder_type,
  binders.is_public,
  binders.user_id as owner_user_id,
  profiles.email as owner_email,
  profiles.collector_name as owner_collector_name,
  binders.created_at
from public.binders
left join public.profiles
  on profiles.id = binders.user_id
order by binders.created_at desc;

revoke all on public.admin_binder_directory_view from anon;
revoke all on public.admin_binder_directory_view from authenticated;

grant select on public.admin_binder_directory_view to service_role;
