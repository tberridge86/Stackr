alter table public.market_product_price_snapshots
  add column if not exists tcg_low numeric null,
  add column if not exists tcg_mid numeric null,
  add column if not exists tcg_market numeric null,
  add column if not exists tcg_product_id integer null;

comment on column public.market_product_price_snapshots.tcg_low is
  'Latest TCGCSV low product price in GBP.';

comment on column public.market_product_price_snapshots.tcg_mid is
  'Latest TCGCSV mid product price in GBP.';

comment on column public.market_product_price_snapshots.tcg_market is
  'Latest TCGCSV market product price in GBP.';

comment on column public.market_product_price_snapshots.tcg_product_id is
  'Matched TCGPlayer/TCGCSV product id.';
