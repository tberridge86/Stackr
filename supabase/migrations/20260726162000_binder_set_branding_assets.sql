alter table if exists public.binders
  add column if not exists source_set_logo_url text,
  add column if not exists source_set_symbol_url text,
  add column if not exists source_set_cover_url text,
  add column if not exists source_set_display_name text,
  add column if not exists source_set_local_name text,
  add column if not exists source_set_english_display_name text;

comment on column public.binders.source_set_logo_url is
  'Provider or controlled-storage logo URL saved when an official set binder is created.';

comment on column public.binders.source_set_symbol_url is
  'Provider or controlled-storage set symbol URL saved as a fallback for official set binders.';

comment on column public.binders.source_set_cover_url is
  'Provider or controlled-storage cover image URL saved as a fallback for official set binders.';

comment on column public.binders.source_set_display_name is
  'Resolved display name for the source set at binder creation time.';

comment on column public.binders.source_set_local_name is
  'Local-language source set name at binder creation time.';

comment on column public.binders.source_set_english_display_name is
  'English-recognised source set name at binder creation time.';
