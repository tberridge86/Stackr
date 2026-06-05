create table if not exists public.poketrace_api_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  response jsonb not null,
  cached_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists poketrace_api_cache_expires_at_idx
  on public.poketrace_api_cache(expires_at);

alter table public.poketrace_api_cache enable row level security;

grant select, insert, update, delete on public.poketrace_api_cache to service_role;

comment on table public.poketrace_api_cache is
  'Server-side cache for PokeTrace card and history responses. Accessed only by the backend service role.';
