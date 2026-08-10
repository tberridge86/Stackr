alter table public.scan_learning_events
  drop constraint if exists scan_learning_events_event_type_check;

alter table public.scan_learning_events
  add constraint scan_learning_events_event_type_check
  check (
    event_type in (
      'attempt',
      'candidate_selected',
      'match_incorrect',
      'none_correct',
      'manual_search',
      'added_to_binder',
      'rescan',
      'cancellation',
      'duplicate_prevented'
    )
  );

create index if not exists scan_learning_events_type_created_idx
  on public.scan_learning_events(event_type, created_at desc);

create index if not exists scan_learning_events_scan_mode_created_idx
  on public.scan_learning_events(scan_mode, created_at desc)
  where scan_mode is not null;

create index if not exists scan_learning_events_route_context_gin_idx
  on public.scan_learning_events using gin (route_context);

create index if not exists scan_learning_events_frame_metrics_gin_idx
  on public.scan_learning_events using gin (frame_metrics);

drop policy if exists "Admins can read scanner analytics" on public.scan_learning_events;
create policy "Admins can read scanner analytics"
  on public.scan_learning_events
  for select
  to authenticated
  using (public.is_admin());

comment on column public.scan_learning_events.route_context is
  'Structured scanner context including intent, coarse client/device class, feature flags, correction metadata and analytics timings. No raw images are stored here.';
