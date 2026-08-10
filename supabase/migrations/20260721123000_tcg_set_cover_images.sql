-- Provides a lightweight visual fallback for sets whose provider record has no
-- logo or symbol. It reuses already-resolved card imagery and does not copy or
-- scrape new assets.

create or replace view public.tcg_set_cover_images as
with ranked_cover_images as (
  select
    c.set_id,
    c.id as card_id,
    c.language,
    c.region,
    c.collector_number,
    coalesce(
      nullif(ci.variants ->> 'grid', ''),
      nullif(ci.variants ->> 'detail', ''),
      nullif(ci.variants ->> 'thumbnail', ''),
      nullif(ci.resolved_image_url, ''),
      nullif(c.image_small_url, ''),
      nullif(c.image_large_url, '')
    ) as cover_image_url,
    row_number() over (
      partition by c.set_id
      order by
        case
          when coalesce(ci.resolution_status, c.image_status) in ('resolved', 'resolved_secondary') then 0
          when c.image_small_url is not null or c.image_large_url is not null then 1
          else 2
        end,
        case
          when c.collector_number ~ '^[0-9]+$' then c.collector_number::integer
          else 999999
        end,
        c.collector_number nulls last,
        c.id
    ) as rank
  from public.tcg_cards c
  left join lateral (
    select ci.*
    from public.card_images ci
    where ci.card_id = c.id
      and ci.resolution_status in ('resolved', 'resolved_secondary')
      and ci.resolved_image_url is not null
    order by ci.last_verified_at desc nulls last, ci.updated_at desc nulls last
    limit 1
  ) ci on true
  where coalesce(
    nullif(ci.variants ->> 'grid', ''),
    nullif(ci.variants ->> 'detail', ''),
    nullif(ci.variants ->> 'thumbnail', ''),
    nullif(ci.resolved_image_url, ''),
    nullif(c.image_small_url, ''),
    nullif(c.image_large_url, '')
  ) is not null
)
select
  set_id,
  card_id,
  language,
  region,
  collector_number,
  cover_image_url
from ranked_cover_images
where rank = 1;

grant select on public.tcg_set_cover_images to anon, authenticated, service_role;
