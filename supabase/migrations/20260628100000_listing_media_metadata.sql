alter table public.user_card_flags
  add column if not exists listing_media jsonb not null default '[]'::jsonb,
  add column if not exists official_image_url text,
  add column if not exists seller_front_image_url text,
  add column if not exists seller_back_image_url text;

alter table public.user_card_flags
  drop constraint if exists user_card_flags_listing_media_is_array;

alter table public.user_card_flags
  add constraint user_card_flags_listing_media_is_array
  check (jsonb_typeof(listing_media) = 'array');

comment on column public.user_card_flags.listing_media is
  'Ordered, labelled marketplace media for seller card photos and optional condition evidence.';

comment on column public.user_card_flags.official_image_url is
  'Official card artwork used as the primary marketplace image where available.';

comment on column public.user_card_flags.seller_front_image_url is
  'Seller-uploaded front image URL required for published marketplace listings.';

comment on column public.user_card_flags.seller_back_image_url is
  'Seller-uploaded back image URL required for published marketplace listings.';
