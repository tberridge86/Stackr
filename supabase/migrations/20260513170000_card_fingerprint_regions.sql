alter table public.card_fingerprints
  add column if not exists fingerprints jsonb,
  add column if not exists algorithm_version integer not null default 1;

comment on column public.card_fingerprints.fingerprints is
  'Region-based perceptual hashes keyed by region name, for example full/art/name/lower/center.';

comment on column public.card_fingerprints.algorithm_version is
  'Fingerprint algorithm version used to generate phash/fingerprints.';
