-- One provider refresh per printing/language/physical variant may be pending.
-- Retain the highest-priority oldest request and close historical duplicates
-- before adding the invariant so this migration is safe on existing data.

with duplicate_pending_refreshes as (
  select
    id,
    row_number() over (
      partition by card_id, language,
        coalesce(nullif(lower(btrim(metadata ->> 'canonicalVariantId')), ''), '__legacy_printing_scope__')
      order by priority desc, requested_at asc, id asc
    ) as duplicate_rank
  from public.price_refresh_queue
  where processed_at is null
)
update public.price_refresh_queue queue
set
  processed_at = now(),
  last_error = coalesce(queue.last_error, 'deduplicated_before_pending_refresh_uniqueness')
from duplicate_pending_refreshes duplicate
where queue.id = duplicate.id
  and duplicate.duplicate_rank > 1;

create unique index if not exists price_refresh_queue_pending_card_language_uidx
  on public.price_refresh_queue(card_id, language,
    coalesce(nullif(lower(btrim(metadata ->> 'canonicalVariantId')), ''), '__legacy_printing_scope__'))
  where processed_at is null;

comment on index public.price_refresh_queue_pending_card_language_uidx is
  'Transitional index preserving sibling variants while deduplicating one printing/language/variant scope.';
