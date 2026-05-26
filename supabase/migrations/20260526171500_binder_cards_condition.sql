alter table public.binder_cards
  add column if not exists condition text default 'Near Mint';
