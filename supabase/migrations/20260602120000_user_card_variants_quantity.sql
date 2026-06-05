alter table public.user_card_variants
  add column if not exists quantity integer not null default 1 check (quantity >= 1);

create unique index if not exists user_card_variants_user_card_set_variant_uidx
  on public.user_card_variants(user_id, card_id, set_id, variant);

comment on column public.user_card_variants.quantity is
  'Number of copies owned for this card variant.';
