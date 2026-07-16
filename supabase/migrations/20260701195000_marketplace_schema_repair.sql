alter table public.user_card_flags
  add column if not exists value text,
  add column if not exists condition text,
  add column if not exists notes text,
  add column if not exists asking_price numeric,
  add column if not exists market_estimate numeric,
  add column if not exists trade_only boolean not null default false,
  add column if not exists has_damage boolean not null default false,
  add column if not exists damage_notes text,
  add column if not exists damage_image_url text,
  add column if not exists listing_notes text,
  add column if not exists listing_images text[] not null default '{}'::text[],
  add column if not exists listing_status text not null default 'active',
  add column if not exists product_type text default 'raw_card',
  add column if not exists product_name text,
  add column if not exists pricing_mode text default 'raw',
  add column if not exists grade_company text,
  add column if not exists grade text,
  add column if not exists admin_review_required boolean not null default false,
  add column if not exists admin_review_reason text,
  add column if not exists listing_media jsonb not null default '[]'::jsonb,
  add column if not exists official_image_url text,
  add column if not exists seller_front_image_url text,
  add column if not exists seller_back_image_url text;

alter table public.user_card_flags
  drop constraint if exists user_card_flags_listing_status_valid;

alter table public.user_card_flags
  add constraint user_card_flags_listing_status_valid
  check (listing_status in ('active', 'archived', 'sold'));

alter table public.user_card_flags
  drop constraint if exists user_card_flags_listing_media_is_array;

alter table public.user_card_flags
  add constraint user_card_flags_listing_media_is_array
  check (jsonb_typeof(listing_media) = 'array');

update public.user_card_flags
set listing_status = 'active'
where flag_type = 'trade'
  and listing_status is null;

update public.user_card_flags
set listing_media = '[]'::jsonb
where listing_media is null;

alter table public.user_card_flags
  alter column listing_status set default 'active',
  alter column trade_only set default false,
  alter column has_damage set default false,
  alter column admin_review_required set default false,
  alter column listing_media set default '[]'::jsonb;

create index if not exists idx_user_card_flags_marketplace_active
  on public.user_card_flags (listing_status, created_at desc)
  where flag_type = 'trade';

create index if not exists idx_user_card_flags_marketplace_user
  on public.user_card_flags (user_id, listing_status, created_at desc)
  where flag_type = 'trade';
