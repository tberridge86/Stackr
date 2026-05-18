alter table public.user_card_flags
  add column if not exists product_type text default 'raw_card',
  add column if not exists product_name text,
  add column if not exists pricing_mode text default 'raw',
  add column if not exists grade_company text,
  add column if not exists grade text,
  add column if not exists admin_review_required boolean default false,
  add column if not exists admin_review_reason text;

