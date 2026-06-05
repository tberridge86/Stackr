create unique index if not exists user_card_variants_user_card_set_variant_uidx
  on public.user_card_variants(user_id, card_id, set_id, variant);
