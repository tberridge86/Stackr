create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, read);

create index if not exists trade_offers_sender_status_idx
  on public.trade_offers(sender_id, status);

create index if not exists trade_offers_receiver_status_idx
  on public.trade_offers(receiver_id, status);

create index if not exists user_card_flags_user_listing_status_idx
  on public.user_card_flags(user_id, listing_status);

create index if not exists seller_inventory_items_user_idx
  on public.seller_inventory_items(user_id);

create index if not exists seller_sale_transactions_user_idx
  on public.seller_sale_transactions(user_id);

create index if not exists binder_card_showcases_user_idx
  on public.binder_card_showcases(user_id);

create index if not exists market_price_snapshots_card_set_language_idx
  on public.market_price_snapshots(card_id, set_id, language);

comment on index public.notifications_user_unread_idx is
  'Supports fast unread notification badge counts.';

comment on index public.trade_offers_sender_status_idx is
  'Supports profile/home trade status summaries for sent trades.';

comment on index public.trade_offers_receiver_status_idx is
  'Supports profile/home trade status summaries for received trades.';

comment on index public.user_card_flags_user_listing_status_idx is
  'Supports profile listing totals and active listing filtering.';

comment on index public.market_price_snapshots_card_set_language_idx is
  'Supports card/set/language price-history existence checks.';
