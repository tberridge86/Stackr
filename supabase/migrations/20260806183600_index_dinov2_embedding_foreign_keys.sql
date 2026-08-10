create index if not exists card_embeddings_dinov2_vits14_384_index_version_idx
  on ml.card_embeddings_dinov2_vits14_384(index_version_id)
  where deprecated_at is null;

create index if not exists card_embeddings_dinov2_vits14_384_variant_idx
  on ml.card_embeddings_dinov2_vits14_384(variant_id)
  where deprecated_at is null;

create index if not exists card_embeddings_dinov2_vits14_384_reference_asset_idx
  on ml.card_embeddings_dinov2_vits14_384(reference_asset_id)
  where reference_asset_id is not null and deprecated_at is null;

create index if not exists card_embeddings_dinov2_vits14_384_language_idx
  on ml.card_embeddings_dinov2_vits14_384(language_code)
  where deprecated_at is null;
