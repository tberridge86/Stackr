-- Refresh requests are exact canonical physical variants.  A printing can
-- legitimately have multiple same-language finishes, so the old card/language
-- invariant incorrectly collapsed their work onto whichever request arrived
-- first.  Legacy rows intentionally retain a separate, explicit unscoped key.

-- Queue rows created by older Pricing V2 builds do not carry enough canonical
-- identity to be replayed safely. Quarantine them as completed-with-error so
-- they cannot starve new exact work or be rehydrated as a printing-level card.
update public.price_refresh_queue as queue
set
  processed_at = now(),
  attempts = coalesce(queue.attempts, 0) + 1,
  last_error = 'quarantined_incomplete_exact_identity_before_exact_variant_queue_upgrade'
where queue.processed_at is null
  and (
    queue.reason like 'pricing_v2%'
    or queue.metadata ->> 'pricingEngine' = 'v2'
    or (
      queue.reason = 'manual_snapshot_refresh'
      and queue.metadata ->> 'refreshPipeline' in ('pricing_v2_exact', 'legacy_snapshot')
    )
  )
  and (
    nullif(btrim(queue.metadata ->> 'canonicalVariantId'), '') is null
    or nullif(btrim(queue.metadata ->> 'identityKey'), '') is null
    or nullif(btrim(queue.metadata ->> 'canonicalCardName'), '') is null
    or (
      coalesce(nullif(btrim(queue.metadata ->> 'productType'), ''), 'raw_card') <> 'sealed_product'
      and nullif(btrim(queue.metadata ->> 'cardNumber'), '') is null
    )
    or (
      queue.metadata ->> 'productType' = 'sealed_product'
      and nullif(btrim(queue.metadata ->> 'sealedProductType'), '') is null
    )
  );

with duplicate_pending_refreshes as (
  select
    id,
    row_number() over (
      partition by
        card_id,
        language,
        coalesce(nullif(lower(btrim(metadata ->> 'canonicalVariantId')), ''), '__legacy_printing_scope__')
      order by priority desc, requested_at asc, id asc
    ) as duplicate_rank
  from public.price_refresh_queue
  where processed_at is null
)
update public.price_refresh_queue as queue
set
  processed_at = now(),
  last_error = coalesce(queue.last_error, 'deduplicated_before_exact_variant_pending_refresh_uniqueness')
from duplicate_pending_refreshes as duplicate
where queue.id = duplicate.id
  and duplicate.duplicate_rank > 1;

drop index if exists public.price_refresh_queue_pending_card_language_uidx;

create unique index if not exists price_refresh_queue_pending_card_language_variant_uidx
  on public.price_refresh_queue (
    card_id,
    language,
    coalesce(nullif(lower(btrim(metadata ->> 'canonicalVariantId')), ''), '__legacy_printing_scope__')
  )
  where processed_at is null;

comment on index public.price_refresh_queue_pending_card_language_variant_uidx is
  'Prevents duplicate pending work only for the same printing, language, and canonical variant; unscoped legacy rows remain explicitly printing-level.';

-- The source-filtered, identity-scoped history RPC is defined by the preceding
-- 20260904130000 migration. Do not overwrite it with an older projection.
