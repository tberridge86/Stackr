create or replace function api.persist_online_recognition_scaleup_results(
  p_run_id uuid,
  p_stage text,
  p_results jsonb,
  p_manifest jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  persisted integer := 0;
  review_rows integer := 0;
  outcome text;
  scan_uuid uuid;
  expected_variant uuid;
  predicted_variant uuid;
begin
  if p_run_id is null
    or p_stage not in ('gate-100', 'scale-1000')
    or jsonb_typeof(p_results) <> 'array'
    or jsonb_array_length(p_results) < 1
    or jsonb_array_length(p_results) > 25
    or p_manifest->>'projectRef' <> 'lmwfhvexfcoyeuoyrlco'
    or coalesce((p_manifest->>'productionModified')::boolean, true)
    or p_manifest->>'indexVersionId' <> '003dec73-cb69-4ff2-a994-e559d9791a56'
    or p_manifest->>'scoringVersion' <> 'stackr-online-recognition-scaleup-v1.0.0' then
    raise exception 'Invalid online recognition scale-up persistence request.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_results)
  loop
    outcome := item->>'outcome';
    scan_uuid := (item->>'scanId')::uuid;
    expected_variant := nullif(item#>>'{expected,variantId}', '')::uuid;
    predicted_variant := nullif(item->>'topCandidate', '')::uuid;
    if outcome not in ('auto_linked_exact', 'review_required', 'rejected_conflict', 'no_candidate')
      or scan_uuid is null
      or item->>'probeIdentitySha256' !~ '^[0-9a-f]{64}$'
      or item->>'imageSha256' !~ '^[0-9a-f]{64}$'
      or not coalesce((item->>'provenanceComplete')::boolean, false) then
      raise exception 'Incomplete or non-deterministic probe result.' using errcode = '22023';
    end if;

    insert into ml.recognition_scan_diagnostics (
      scan_id, request_id, route_version, model_version, index_version,
      requested_path, source_type, match_status, candidate_count,
      top_variant_id, overall_confidence, score_summary, uncertainty_flags,
      requested_next_action, capture_quality, ocr_summary,
      image_retention_status, diagnostic_payload, consent_state, source_updated_at
    ) values (
      scan_uuid, p_run_id::text, 'online-recognition-scaleup-v1', 'dinov2_vits14',
      p_manifest->>'indexVersion', 'embed', 'device_embedding',
      case outcome when 'auto_linked_exact' then 'exact' when 'review_required' then 'ambiguous'
        when 'rejected_conflict' then 'rejected' else 'no_match' end,
      jsonb_array_length(coalesce(item->'ranked', '[]'::jsonb)), predicted_variant,
      nullif(item->>'topScore', '')::numeric,
      jsonb_build_object(
        'top1Exact', coalesce((item->>'top1Exact')::boolean, false),
        'top3Retrieved', coalesce((item->>'top3Retrieved')::boolean, false),
        'topVisualScore', item->'topVisualScore', 'margin', item->'margin'
      ),
      coalesce(array(select jsonb_array_elements_text(item->'conflicts')), '{}'::text[]),
      case outcome when 'auto_linked_exact' then 'auto_confirm_allowed'
        when 'rejected_conflict' then 'manual_entry' else 'confirm_candidate' end,
      jsonb_build_object('width', item->'width', 'height', item->'height', 'layout', item->'layout'),
      coalesce(item->'ocr', '{}'::jsonb) - 'text', 'none',
      (item - 'embedding' - 'ocr') || jsonb_build_object(
        'benchmarkKind', 'online_recognition_scaleup_v1',
        'benchmarkStage', p_stage,
        'runId', p_run_id,
        'ocrTextSha256', encode(extensions.digest(coalesce(item#>>'{ocr,text}', ''), 'sha256'), 'hex'),
        'productionModified', false
      ),
      jsonb_build_object('benchmarkEvidenceOnly', true, 'retainImage', false), now()
    )
    on conflict (scan_id) do update set
      match_status = excluded.match_status,
      candidate_count = excluded.candidate_count,
      top_variant_id = excluded.top_variant_id,
      overall_confidence = excluded.overall_confidence,
      score_summary = excluded.score_summary,
      uncertainty_flags = excluded.uncertainty_flags,
      requested_next_action = excluded.requested_next_action,
      ocr_summary = excluded.ocr_summary,
      diagnostic_payload = excluded.diagnostic_payload,
      source_updated_at = excluded.source_updated_at,
      updated_at = now();
    persisted := persisted + 1;

    if outcome <> 'auto_linked_exact' and not exists (
      select 1 from ml.recognition_feedback_items
      where physical_card_session_id = item->>'probeIdentitySha256'
        and capture_metadata->>'benchmarkKind' = 'online_recognition_scaleup_v1'
        and deleted_at is null
    ) then
      insert into ml.recognition_feedback_items (
        variant_id, predicted_variant_id, feedback_action, reviewed_status,
        capture_metadata, ocr_evidence, model_version, physical_card_session_id,
        image_checksum_sha256, consent_state, source_updated_at
      ) values (
        expected_variant, predicted_variant,
        case outcome when 'no_candidate' then 'missing_card' when 'rejected_conflict' then 'variant_correction' else 'manual_correction' end,
        'queued',
        (item - 'embedding' - 'ocr') || jsonb_build_object(
          'benchmarkKind', 'online_recognition_scaleup_v1', 'benchmarkStage', p_stage,
          'runId', p_run_id, 'productionModified', false
        ),
        coalesce(item->'ocr', '{}'::jsonb) - 'text', 'dinov2_vits14',
        item->>'probeIdentitySha256', item->>'imageSha256',
        jsonb_build_object('benchmarkEvidenceOnly', true, 'retainImage', false), now()
      );
      review_rows := review_rows + 1;
    end if;
  end loop;

  return jsonb_build_object('persisted', persisted, 'reviewRowsCreated', review_rows, 'productionModified', false);
end;
$$;

revoke all on function api.persist_online_recognition_scaleup_results(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function api.persist_online_recognition_scaleup_results(uuid, text, jsonb, jsonb) to service_role;
