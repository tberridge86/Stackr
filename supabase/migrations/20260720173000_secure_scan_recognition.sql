create table if not exists public.scan_recognition_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scan_session_id text,
  image_hash text,
  endpoint text not null,
  recognition_reason text,
  outcome text not null,
  http_status integer,
  latency_ms integer,
  request_bytes integer,
  candidate_count integer default 0,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists scan_recognition_requests_user_created_idx
  on public.scan_recognition_requests (user_id, created_at desc);

create index if not exists scan_recognition_requests_hash_endpoint_idx
  on public.scan_recognition_requests (image_hash, endpoint, created_at desc);

create table if not exists public.scan_recognition_cache (
  id uuid primary key default gen_random_uuid(),
  image_hash text not null,
  endpoint text not null,
  response jsonb not null,
  confidence numeric,
  candidate_count integer default 0,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (image_hash, endpoint)
);

create index if not exists scan_recognition_cache_lookup_idx
  on public.scan_recognition_cache (image_hash, endpoint, expires_at desc);

alter table public.scan_recognition_requests enable row level security;
alter table public.scan_recognition_cache enable row level security;

drop policy if exists "scan recognition request owner read" on public.scan_recognition_requests;
create policy "scan recognition request owner read"
  on public.scan_recognition_requests
  for select
  to authenticated
  using (auth.uid() = user_id);
