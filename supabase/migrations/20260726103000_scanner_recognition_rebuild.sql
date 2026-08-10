create extension if not exists pgcrypto with schema extensions;

alter table public.scanner_benchmark_cases
  drop constraint if exists scanner_benchmark_cases_language_check;

alter table public.scanner_benchmark_cases
  add constraint scanner_benchmark_cases_language_check
  check (language in ('en', 'ja', 'zh', 'zh-Hans', 'zh-Hant', 'unknown'));

alter table public.scanner_benchmark_cases
  add column if not exists capture_type text,
  add column if not exists sleeve_status text,
  add column if not exists background text,
  add column if not exists capture_angle_degrees numeric,
  add column if not exists quality_bucket text,
  add column if not exists rights_status text,
  add column if not exists label_verification_status text not null default 'verified';

alter table public.scanner_benchmark_results
  add column if not exists confidence numeric,
  add column if not exists no_match boolean not null default false,
  add column if not exists incorrect_confident_match boolean not null default false,
  add column if not exists camera_ready_ms integer,
  add column if not exists capture_ms integer,
  add column if not exists crop_ms integer,
  add column if not exists first_candidate_ms integer,
  add column if not exists final_result_ms integer,
  add column if not exists pipeline_version text,
  add column if not exists quality_failures jsonb not null default '[]'::jsonb,
  add column if not exists candidate_evidence jsonb not null default '{}'::jsonb;

create table if not exists public.scanner_training_samples (
  id uuid primary key default gen_random_uuid(),
  stackr_card_id text not null,
  set_id text not null,
  language text not null check (language in ('en', 'ja', 'zh', 'zh-Hans', 'zh-Hant', 'unknown')),
  collector_number text not null,
  variant text,
  image_source text not null,
  source_url text,
  source_type text not null default 'user_contributed'
    check (source_type in ('user_contributed', 'partner', 'licensed_catalogue', 'internal_fixture', 'owned_asset')),
  rights_status text not null
    check (rights_status in ('user_consent', 'licensed', 'owned', 'public_domain', 'permitted', 'blocked', 'unknown')),
  permitted_use_notes text,
  storage_path text,
  checksum_sha256 text,
  perceptual_hash text,
  mime_type text,
  image_width integer,
  image_height integer,
  capture_type text not null default 'single_card'
    check (capture_type in ('single_card', 'binder_page', 'slab', 'listing_photo', 'marketplace_reference')),
  lighting text not null default 'unknown',
  capture_angle_degrees numeric,
  sleeve_status text not null default 'unknown'
    check (sleeve_status in ('none', 'sleeve', 'toploader', 'slab', 'unknown')),
  background text,
  quality_score numeric,
  label_verification_status text not null default 'unverified'
    check (label_verification_status in ('unverified', 'user_reported', 'reviewed', 'verified', 'rejected')),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.scanner_training_augmentations (
  id uuid primary key default gen_random_uuid(),
  source_sample_id uuid not null references public.scanner_training_samples(id) on delete cascade,
  augmentation_type text not null check (
    augmentation_type in (
      'mild_rotation',
      'perspective',
      'lighting_variation',
      'blur',
      'glare_simulation',
      'partial_obstruction',
      'background_variation'
    )
  ),
  parameters jsonb not null default '{}'::jsonb,
  generated_storage_path text,
  checksum_sha256 text,
  defining_characteristics_preserved boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.scanner_feedback_review_queue (
  id uuid primary key default gen_random_uuid(),
  scan_learning_event_id uuid not null unique references public.scan_learning_events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  scan_session_id text not null,
  event_type text not null,
  incorrect_candidate_id text,
  selected_correct_card_id text,
  candidate_confidences jsonb not null default '{}'::jsonb,
  recognition_context jsonb not null default '{}'::jsonb,
  visual_feature_consent boolean not null default false,
  anonymized_visual_features jsonb,
  label_verification_status text not null default 'user_reported'
    check (label_verification_status in ('user_reported', 'queued_for_review', 'verified', 'rejected')),
  review_status text not null default 'queued'
    check (review_status in ('queued', 'reviewed', 'dismissed')),
  priority integer not null default 50,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.scanner_confusion_pairs (
  id uuid primary key default gen_random_uuid(),
  incorrect_candidate_id text not null,
  correct_card_id text,
  language text,
  set_id text,
  occurrence_count integer not null default 1,
  latest_scan_learning_event_id uuid references public.scan_learning_events(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (incorrect_candidate_id, correct_card_id)
);

create index if not exists scanner_benchmark_cases_segments_idx
  on public.scanner_benchmark_cases(active, language, era, lighting, item_type, capture_type, sleeve_status);

create index if not exists scanner_benchmark_results_recall_idx
  on public.scanner_benchmark_results(run_id, top_one_correct, top_three_correct, no_match, incorrect_confident_match);

create index if not exists scanner_training_samples_card_idx
  on public.scanner_training_samples(stackr_card_id, language, set_id, collector_number);

create index if not exists scanner_training_samples_rights_idx
  on public.scanner_training_samples(rights_status, label_verification_status, created_at desc);

create index if not exists scanner_feedback_review_queue_status_idx
  on public.scanner_feedback_review_queue(review_status, priority desc, created_at);

create index if not exists scanner_confusion_pairs_priority_idx
  on public.scanner_confusion_pairs(occurrence_count desc, last_seen_at desc);

alter table public.scanner_training_samples enable row level security;
alter table public.scanner_training_augmentations enable row level security;
alter table public.scanner_feedback_review_queue enable row level security;
alter table public.scanner_confusion_pairs enable row level security;

drop policy if exists "Users can insert own scanner training samples" on public.scanner_training_samples;
create policy "Users can insert own scanner training samples"
  on public.scanner_training_samples
  for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Admins can manage scanner training samples" on public.scanner_training_samples;
create policy "Admins can manage scanner training samples"
  on public.scanner_training_samples
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can manage scanner training augmentations" on public.scanner_training_augmentations;
create policy "Admins can manage scanner training augmentations"
  on public.scanner_training_augmentations
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can manage scanner feedback queue" on public.scanner_feedback_review_queue;
create policy "Admins can manage scanner feedback queue"
  on public.scanner_feedback_review_queue
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can manage scanner confusion pairs" on public.scanner_confusion_pairs;
create policy "Admins can manage scanner confusion pairs"
  on public.scanner_confusion_pairs
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.queue_scanner_feedback_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  feedback jsonb;
  incorrect_id text;
  correct_id text;
begin
  feedback := new.route_context -> 'recognitionFeedback';
  if feedback is null then
    return new;
  end if;

  incorrect_id := nullif(feedback ->> 'incorrectCandidateId', '');
  correct_id := nullif(feedback ->> 'correctCardId', '');

  if new.event_type not in ('match_incorrect', 'none_correct', 'candidate_selected') then
    return new;
  end if;

  if incorrect_id is null and correct_id is null then
    return new;
  end if;

  insert into public.scanner_feedback_review_queue (
    scan_learning_event_id,
    user_id,
    scan_session_id,
    event_type,
    incorrect_candidate_id,
    selected_correct_card_id,
    candidate_confidences,
    recognition_context,
    visual_feature_consent,
    anonymized_visual_features,
    label_verification_status,
    review_status,
    priority
  ) values (
    new.id,
    new.user_id,
    new.scan_session_id,
    new.event_type,
    incorrect_id,
    correct_id,
    coalesce(feedback -> 'candidateConfidences', '{}'::jsonb),
    new.route_context,
    coalesce((feedback ->> 'visualFeatureConsent')::boolean, false),
    case when coalesce((feedback ->> 'visualFeatureConsent')::boolean, false)
      then feedback -> 'anonymizedVisualFeatures'
      else null
    end,
    coalesce(nullif(feedback ->> 'labelVerificationStatus', ''), 'user_reported'),
    coalesce(nullif(feedback ->> 'reviewStatus', ''), 'queued'),
    case
      when new.event_type = 'match_incorrect' then 90
      when new.event_type = 'none_correct' then 75
      else 65
    end
  )
  on conflict (scan_learning_event_id) do nothing;

  if incorrect_id is not null then
    insert into public.scanner_confusion_pairs (
      incorrect_candidate_id,
      correct_card_id,
      language,
      set_id,
      occurrence_count,
      latest_scan_learning_event_id,
      metadata
    ) values (
      incorrect_id,
      correct_id,
      new.route_context #>> '{analytics,language}',
      coalesce(new.selected_set_id, new.route_context #>> '{correction,correctSetId}', new.route_context #>> '{correction,predictedSetId}'),
      1,
      new.id,
      jsonb_build_object('latestEventType', new.event_type)
    )
    on conflict (incorrect_candidate_id, correct_card_id) do update
    set
      occurrence_count = public.scanner_confusion_pairs.occurrence_count + 1,
      latest_scan_learning_event_id = excluded.latest_scan_learning_event_id,
      last_seen_at = now(),
      metadata = public.scanner_confusion_pairs.metadata || excluded.metadata;
  end if;

  return new;
end;
$$;

drop trigger if exists scan_learning_events_queue_feedback_review on public.scan_learning_events;
create trigger scan_learning_events_queue_feedback_review
  after insert on public.scan_learning_events
  for each row
  execute function public.queue_scanner_feedback_review();

grant select, insert, update, delete on table public.scanner_training_samples to authenticated, service_role;
grant select, insert, update, delete on table public.scanner_training_augmentations to authenticated, service_role;
grant select, insert, update, delete on table public.scanner_feedback_review_queue to authenticated, service_role;
grant select, insert, update, delete on table public.scanner_confusion_pairs to authenticated, service_role;

comment on table public.scanner_training_samples is
  'Rights-aware scanner training and evaluation samples. No sample should be used for model training unless rights_status and label_verification_status permit it.';

comment on table public.scanner_training_augmentations is
  'Controlled scanner augmentations. Augmentations must not alter defining card characteristics such as artwork, text, set symbol, collector number or rarity.';

comment on table public.scanner_feedback_review_queue is
  'User scan corrections queued for human review. User reports are not automatically treated as verified training labels.';

comment on table public.scanner_confusion_pairs is
  'Aggregated scanner confusion pairs used to prioritise review and benchmark coverage.';
