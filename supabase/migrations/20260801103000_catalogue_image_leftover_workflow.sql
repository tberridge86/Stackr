-- Catalogue image leftover workflow.
-- Repository migration only. Validate in staging before applying anywhere else.

alter table if exists catalog.card_variants
  add column if not exists native_image_status text not null default 'missing',
  add column if not exists same_artwork_as_variant_id uuid references catalog.card_variants(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'card_variants_native_image_status_check'
  ) then
    alter table catalog.card_variants
      add constraint card_variants_native_image_status_check
      check (native_image_status in (
        'missing',
        'available',
        'same_artwork_reference',
        'scan_acquisition_required',
        'pending_review'
      ));
  end if;
end $$;

alter table if exists catalog.assets
  add column if not exists acquisition_source text not null default 'provider_url';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assets_acquisition_source_check'
  ) then
    alter table catalog.assets
      add constraint assets_acquisition_source_check
      check (acquisition_source in (
        'provider_url',
        'approved_commercial_provider',
        'existing_stackr_catalogue_asset',
        'own_scan',
        'partner_shop_scan',
        'collector_submitted',
        'user_licensed',
        'unknown'
      ));
  end if;
end $$;

alter table if exists ingest.work_queue
  drop constraint if exists work_queue_queue_name_check,
  add constraint work_queue_queue_name_check
  check (queue_name in (
    'catalogue_ingestion',
    'asset_processing',
    'embedding_generation',
    'price_refresh',
    'conflict_review',
    'scan_acquisition'
  ));

alter table if exists ingest.work_queue
  drop constraint if exists work_queue_command_check,
  add constraint work_queue_command_check
  check (command in (
    'run_source',
    'run_language',
    'run_set',
    'resume_import',
    'rebuild_record',
    'process_asset',
    'generate_embedding',
    'refresh_price',
    'review_conflict',
    'request_scan_acquisition',
    'validate_contributed_scan',
    'review_contributed_scan'
  ));

create index if not exists card_variants_native_image_status_idx
  on catalog.card_variants(native_image_status, language_code, set_id)
  where deprecated_at is null;

create index if not exists card_variants_same_artwork_as_idx
  on catalog.card_variants(same_artwork_as_variant_id)
  where same_artwork_as_variant_id is not null;

comment on column catalog.card_variants.native_image_status is
  'Native-language image state. Another-language artwork must not mark the variant as available.';

comment on column catalog.card_variants.same_artwork_as_variant_id is
  'Optional same-artwork reference to another printing. This never substitutes for the native card image.';

comment on column catalog.assets.acquisition_source is
  'Source path for image assets. User or partner scans require written permission and human review before public catalogue use.';

comment on constraint work_queue_queue_name_check on ingest.work_queue is
  'Includes scan_acquisition for own scans, partner-shop scans and collector-submitted scans with permission.';
