create table if not exists public.scan_grading_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scan_session_id text,
  intent text not null default 'full_pregrade',
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'complete', 'failed', 'requires_rescan')),
  provider text,
  photo_count integer not null default 0,
  photo_stages text[] not null default '{}',
  result jsonb,
  error_code text,
  error_message text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists scan_grading_jobs_user_status_idx
  on public.scan_grading_jobs (user_id, status, queued_at desc);

alter table public.scan_grading_jobs enable row level security;

drop policy if exists "scan grading jobs owner read" on public.scan_grading_jobs;
create policy "scan grading jobs owner read"
  on public.scan_grading_jobs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "scan grading jobs owner insert" on public.scan_grading_jobs;
create policy "scan grading jobs owner insert"
  on public.scan_grading_jobs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "scan grading jobs owner update" on public.scan_grading_jobs;
create policy "scan grading jobs owner update"
  on public.scan_grading_jobs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
