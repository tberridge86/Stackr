-- Trigger-only guards must not be callable as public RPC endpoints.
-- The trigger owner retains normal trigger execution; service_role keeps its
-- explicit administrative EXECUTE grant for controlled repair work.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $guard$
declare
  v_expected integer := 4;
  v_matching integer;
begin
  select count(*) into v_matching
  from pg_proc procedure_row
  join pg_namespace namespace on namespace.oid=procedure_row.pronamespace
  where namespace.nspname='public'
    and procedure_row.prorettype='trigger'::regtype
    and (procedure_row.proname, md5(pg_get_functiondef(procedure_row.oid))) in (
      ('guard_reserved_binder_delete','40573b3822e6e1446914b2edef1d5992'),
      ('guard_reserved_binder_membership_mutation','972bb5b00f4ab077dae60527c549d73c'),
      ('guard_reserved_owned_variant_mutation','cedc5566dd3f93aa385562658e50eb09'),
      ('guard_reserved_seller_inventory_mutation','104a2b067d3fa970f7b25490ef3d4eac')
    );
  if v_matching <> v_expected then
    raise exception 'expected binder reservation trigger guards are absent or incompatible; refusing privilege change';
  end if;
end;
$guard$;

revoke execute on function public.guard_reserved_binder_delete() from public, anon, authenticated;
revoke execute on function public.guard_reserved_binder_membership_mutation() from public, anon, authenticated;
revoke execute on function public.guard_reserved_owned_variant_mutation() from public, anon, authenticated;
revoke execute on function public.guard_reserved_seller_inventory_mutation() from public, anon, authenticated;

grant execute on function public.guard_reserved_binder_delete() to service_role;
grant execute on function public.guard_reserved_binder_membership_mutation() to service_role;
grant execute on function public.guard_reserved_owned_variant_mutation() to service_role;
grant execute on function public.guard_reserved_seller_inventory_mutation() to service_role;

commit;
