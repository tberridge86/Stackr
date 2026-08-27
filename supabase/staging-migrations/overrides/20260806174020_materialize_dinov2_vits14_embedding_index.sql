-- Materialise the selected DINOv2 embedding shape. Index rows remain runtime
-- data and are activated only through ml.activate_embedding_index_version.
create table if not exists ml.card_embeddings_dinov2_vits14_384 (
  id uuid primary key default gen_random_uuid(),
  model_id text not null references ml.embedding_models(model_id) on delete restrict,
  index_version_id uuid not null references ml.embedding_index_versions(id) on delete cascade,
  variant_id uuid not null references catalog.card_variants(id) on delete cascade,
  reference_asset_id uuid references catalog.assets(id) on delete set null,
  source_image_id text not null,
  language_code text not null references catalog.languages(code) on delete restrict,
  embedding extensions.vector(384) not null,
  embedding_norm numeric not null,
  preprocessing_checksum_sha256 text not null,
  source_image_checksum_sha256 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deprecated_at timestamptz,
  unique (model_id, index_version_id, variant_id, source_image_id),
  check (embedding_norm > 0.98 and embedding_norm < 1.02),
  check (preprocessing_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  check (source_image_checksum_sha256 is null or source_image_checksum_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists card_embeddings_dinov2_vits14_384_embedding_hnsw_idx
  on ml.card_embeddings_dinov2_vits14_384
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index if not exists card_embeddings_dinov2_vits14_384_metadata_idx
  on ml.card_embeddings_dinov2_vits14_384(model_id, language_code, variant_id)
  where deprecated_at is null;

alter table ml.card_embeddings_dinov2_vits14_384 enable row level security;

drop policy if exists "card embeddings service role manages rows"
  on ml.card_embeddings_dinov2_vits14_384;
create policy "card embeddings service role manages rows"
  on ml.card_embeddings_dinov2_vits14_384
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "recognition service reads card embeddings"
  on ml.card_embeddings_dinov2_vits14_384;
create policy "recognition service reads card embeddings"
  on ml.card_embeddings_dinov2_vits14_384
  for select
  to stackr_recognition
  using (deprecated_at is null);

revoke all on table ml.card_embeddings_dinov2_vits14_384
  from public, anon, authenticated;
grant select, insert, update, delete on table ml.card_embeddings_dinov2_vits14_384
  to service_role;
grant select on table ml.card_embeddings_dinov2_vits14_384
  to stackr_recognition;

alter role stackr_recognition
  set search_path = public, ml, api, audit, catalog, extensions;

comment on table ml.card_embeddings_dinov2_vits14_384 is
  'Versioned DINOv2 ViT-S/14 card-reference embeddings. Runtime index rows are private.';
