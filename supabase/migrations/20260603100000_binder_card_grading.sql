alter table public.binder_cards
  add column if not exists grade_company text,
  add column if not exists grade text;

comment on column public.binder_cards.grade_company is
  'Grading company for this specific binder card, for example PSA, CGC, BGS, or Ace.';

comment on column public.binder_cards.grade is
  'Grade for this specific binder card, for example 10, 9.5, or 9.';
