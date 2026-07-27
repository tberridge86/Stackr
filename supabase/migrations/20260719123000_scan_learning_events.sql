create extension if not exists pgcrypto with schema extensions;

create table if not exists public.scan_learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  scan_session_id text not null,
  event_type text not null check (
    event_type in (
      'attempt',
      'candidate_selected',
      'none_correct',
      'manual_search',
      'added_to_binder'
    )
  ),
  scan_mode text,
  route_context jsonb not null default '{}'::jsonb,
  frame_metrics jsonb not null default '{}'::jsonb,
  ocr_preview text,
  candidate_count integer not null default 0,
  candidates jsonb not null default '[]'::jsonb,
  selected_card_id text,
  selected_set_id text,
  selected_card_name text,
  outcome text,
  notes text,
  client_version text
);

alter table public.scan_learning_events enable row level security;

drop policy if exists "Users can insert own scan learning events" on public.scan_learning_events;
create policy "Users can insert own scan learning events"
  on public.scan_learning_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own scan learning events" on public.scan_learning_events;
create policy "Users can read own scan learning events"
  on public.scan_learning_events
  for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists scan_learning_events_user_created_idx
  on public.scan_learning_events(user_id, created_at desc);

create index if not exists scan_learning_events_session_idx
  on public.scan_learning_events(scan_session_id, created_at);

create index if not exists scan_learning_events_outcome_idx
  on public.scan_learning_events(outcome, created_at desc)
  where outcome is not null;

grant select, insert on table public.scan_learning_events to authenticated;
grant select, insert, update, delete on table public.scan_learning_events to service_role;

comment on table public.scan_learning_events is
  'Anonymous-to-user scoped scanner learning events: attempts, candidate choices, and correction outcomes for improving StackR card recognition.';
