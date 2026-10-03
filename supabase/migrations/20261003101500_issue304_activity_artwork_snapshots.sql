-- Issue #304: keep durable artwork identity on activity events so removal
-- history does not depend on a card still being present in a binder.

alter table public.activity_feed
  add column if not exists card_name_snapshot text,
  add column if not exists card_number_snapshot text,
  add column if not exists card_language_snapshot text,
  add column if not exists card_image_small_snapshot text,
  add column if not exists card_image_large_snapshot text,
  add column if not exists canonical_printing_id uuid,
  add column if not exists canonical_variant_id uuid;

comment on column public.activity_feed.card_image_small_snapshot is
  'Durable exact-card thumbnail captured when the event is written; never resolved from a different printing.';
comment on column public.activity_feed.card_image_large_snapshot is
  'Durable exact-card detail image captured when the event is written; never resolved from a different printing.';
comment on column public.activity_feed.canonical_printing_id is
  'Canonical printing identity known at event time, retained after a holding is removed.';
comment on column public.activity_feed.canonical_variant_id is
  'Exact canonical variant identity known at event time when available.';

-- Preserve existing history. Backfill only an exact legacy card-id match; no
-- name/number/set fuzzy match is permitted because that could substitute a
-- different printing.
update public.activity_feed a
set card_name_snapshot = coalesce(a.card_name_snapshot,c.name),
    card_number_snapshot = coalesce(a.card_number_snapshot,c.number),
    card_language_snapshot = coalesce(a.card_language_snapshot,c.language),
    card_image_small_snapshot = coalesce(a.card_image_small_snapshot,c.image_small),
    card_image_large_snapshot = coalesce(a.card_image_large_snapshot,c.image_large)
from public.pokemon_cards c
where a.card_id=c.id
  and (
    a.card_name_snapshot is null or a.card_number_snapshot is null
    or a.card_language_snapshot is null or a.card_image_small_snapshot is null
    or a.card_image_large_snapshot is null
  );

-- Older events may already have an exact durable movement snapshot even when
-- the current catalogue/holding no longer resolves. Reuse only same-user,
-- same-card-id evidence; never infer by title, set name or collector number.
with exact_movement as (
  select distinct on (a.id)
    a.id as activity_id,
    m.card_name,
    m.image_small
  from public.activity_feed a
  join public.inventory_movements m
    on m.user_id=a.user_id and m.card_id=a.card_id
  where a.card_id is not null
    and (a.card_image_small_snapshot is null or a.card_name_snapshot is null)
  order by a.id, abs(extract(epoch from (m.created_at-a.created_at))) asc, m.created_at desc
)
update public.activity_feed a
set card_name_snapshot=coalesce(a.card_name_snapshot,m.card_name),
    card_image_small_snapshot=coalesce(a.card_image_small_snapshot,m.image_small)
from exact_movement m
where a.id=m.activity_id;

create index if not exists activity_feed_canonical_printing_idx
  on public.activity_feed(canonical_printing_id)
  where canonical_printing_id is not null;
