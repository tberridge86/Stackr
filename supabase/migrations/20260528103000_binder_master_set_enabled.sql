alter table public.binders
  add column if not exists master_set_enabled boolean not null default false;

comment on column public.binders.master_set_enabled is
  'Whether this binder tracks master-set variant completion instead of printed-card completion only.';
