alter table public.binder_cards
  add column if not exists owned_quantity integer not null default 1 check (owned_quantity >= 1);

comment on column public.binder_cards.owned_quantity is
  'Number of copies owned for this binder card. Values above 1 are shown as a card badge.';
