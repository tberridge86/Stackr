alter table public.binders
  add column if not exists default_condition text not null default 'Near Mint';

comment on column public.binders.default_condition is
  'Default condition used for newly displayed or newly added cards in this binder. Individual binder_cards.condition values can override it.';
