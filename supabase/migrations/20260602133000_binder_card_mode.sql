alter table public.binders
  add column if not exists card_mode text not null default 'raw'
    check (card_mode in ('raw', 'graded')),
  add column if not exists default_grade_company text,
  add column if not exists default_grade text;

comment on column public.binders.card_mode is
  'Whether cards in this binder are displayed/priced as raw cards or graded slabs.';

comment on column public.binders.default_grade_company is
  'Default grading company for graded binders, for example PSA, CGC, or BGS.';

comment on column public.binders.default_grade is
  'Default grade for graded binders, for example 10, 9.5, or 9.';
