alter table if exists public.binders
  add column if not exists language text not null default 'en';

create index if not exists binders_user_language_idx
  on public.binders(user_id, language);

comment on column public.binders.language is
  'Primary card language for official set binders. English uses en; Japanese uses ja.';
