create table if not exists public.card_clip_embeddings (
  card_id text primary key references public.pokemon_cards(id) on delete cascade,
  model text not null,
  dimensions integer not null,
  embedding jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists card_clip_embeddings_model_idx
  on public.card_clip_embeddings(model);

comment on table public.card_clip_embeddings is
  'Precomputed CLIP image embeddings for pokemon_cards, used to rerank ambiguous OCR scan matches.';
