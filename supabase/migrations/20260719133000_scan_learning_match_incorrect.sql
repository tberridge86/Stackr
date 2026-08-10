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
      'added_to_binder'
    )
  );
