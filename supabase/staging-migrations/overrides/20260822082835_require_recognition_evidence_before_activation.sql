create or replace function ml.enforce_recognition_evidence_before_activation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'active'
    and old.status is distinct from 'active'
    and old.activated_at is null then
    if coalesce((new.health_report ->> 'activationApproved')::boolean, false) is not true
      or coalesce((new.health_report ->> 'publishedCatalogueMembershipVerified')::boolean, false) is not true
      or coalesce((new.health_report ->> 'invalidReferenceCount')::integer, -1) <> 0
      or coalesce((new.health_report ->> 'duplicateVariantCount')::integer, -1) <> 0
      or coalesce(new.missing_embedding_count, -1) <> 0 then
      raise exception 'Embedding index activation evidence is incomplete or not approved.'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_recognition_evidence_before_activation
  on ml.embedding_index_versions;
create trigger enforce_recognition_evidence_before_activation
  before update of status on ml.embedding_index_versions
  for each row
  execute function ml.enforce_recognition_evidence_before_activation();

revoke all on function ml.enforce_recognition_evidence_before_activation()
  from public, anon, authenticated;

comment on function ml.enforce_recognition_evidence_before_activation() is
  'Blocks first activation of an embedding index until integrity, published-catalogue membership and explicit recognition evidence approval are recorded. Previously activated rollback targets remain available.';
