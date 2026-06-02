alter table public.user_card_variants
  add column if not exists quantity integer not null default 1 check (quantity >= 1);

comment on column public.user_card_variants.quantity is
  'Number of copies owned for this card variant.';
