alter table public.binder_cards
  add column if not exists cert_number text,
  add column if not exists slab_image_url text,
  add column if not exists graded_value numeric,
  add column if not exists graded_at timestamptz;

comment on column public.binder_cards.cert_number is
  'Optional certification number for a graded/slabbed card.';

comment on column public.binder_cards.slab_image_url is
  'Optional user-provided slab photo URL for a graded/slabbed card.';

comment on column public.binder_cards.graded_value is
  'Optional estimated market value for this exact graded/slabbed copy.';

comment on column public.binder_cards.graded_at is
  'Timestamp when this binder card was converted or added as a slab.';
