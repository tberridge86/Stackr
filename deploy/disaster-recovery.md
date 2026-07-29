# Disaster Recovery

This document defines recovery mechanics, not guaranteed recovery-time or recovery-point objectives. Stackr must measure restore drills before publishing either claim.

## Recovery Priorities

1. Protect user authentication, collections and private scan data.
2. Restore a read-only catalogue path through a known-good gateway/API.
3. Keep uncertain recognition fail-closed; do not auto-add cards.
4. Restore catalogue and approved public assets.
5. Restore recognition with a checksum-verified model/index pair.
6. Resume ingestion and pricing only after core integrity is verified.

## Evidence To Record Every Release

```text
Supabase backup timestamp and project ref
logical schema/data dump verification result
Git commit and GitHub workflow URL
Railway deployment IDs
Cloudflare version tags and traffic percentages
active catalogue version and change sequence
active model ID, checksum and index version
EAS update group and runtime version
storage bucket inventory and retention status
```

Do not store database dumps, keys, scan images or provider payloads in public GitHub artifacts.

## Database Loss Or Corruption

1. Stop mutations at the gateway and pause ingestion/price workflows.
2. Record the incident start and choose a recovery timestamp before the bad write.
3. Verify the available Supabase physical backups:

```powershell
npx supabase@2.110.0 backups list `
  --project-ref oakdbbzdqwurpjnoqhmu `
  --output-format json
```

4. Trial restoration on an isolated Supabase branch/project where account features permit it.
5. Only with explicit production approval, perform PITR using a reviewed Unix epoch timestamp:

```powershell
npx supabase@2.110.0 backups restore `
  --project-ref oakdbbzdqwurpjnoqhmu `
  --timestamp '<unix-epoch-seconds>'
```

This is a destructive production operation. It is intentionally absent from automated workflows.

6. Reconcile migration history, run database verification/pgTAP, regenerate types, and smoke-test the API before reopening writes.
7. Compare restored collection counts, catalogue versions, import runs, price observations and audit events against the release evidence. Never fabricate missing totals.

## Supabase Storage Loss

- Public catalogue assets can be rebuilt only from legally approved source records and retained checksums.
- Temporary scan uploads may be intentionally unrecoverable after their retention window.
- Training/feedback captures require consent and must remain private.
- Model/index assets require an approved private source artifact and checksum verification.

The repository does not establish cross-region bucket replication or a verified object export. Until that is configured and restore-tested, storage disaster recovery is incomplete.

## Railway Loss

Create replacement services from the same Git commit and config-as-code files:

```powershell
npx @railway/cli@5.30.1 up backend --path-as-root --ci `
  --project '<project-id>' --environment '<environment-id>' --service '<backend-service-id>'
npx @railway/cli@5.30.1 up recognition-service --path-as-root --ci `
  --project '<project-id>' --environment '<environment-id>' --service '<recognition-service-id>'
```

Recreate runtime variables from the password manager/provider settings, never from logs or source. Keep the gateway on the known-good backend until readiness checks pass.

Railway CPU, memory, replica, and usage limits must be recreated from the release evidence because they are provider-side settings. The repository does not currently contain verified exports of those settings, so Railway disaster recovery remains incomplete until a staging replacement drill records them.

## Cloudflare Loss

Deploy the last known-good Git commit/tag using `gateway/wrangler.jsonc`, restore secrets interactively, and activate the version only after its preview/staging smoke test succeeds. DNS and custom-domain recovery requires Cloudflare account access and is not automated in this repository.

## Model Or Index Loss

Disable `stackrRecognitionPrimary` and image fallback through the previous EAS update, retain local exact lookup, and keep Ximilar only as the controlled emergency fallback. Reinstall the exact approved model checksum and reactivate the matching complete index. Never attach a model to an index with different dimensions or preprocessing.

## Credential Compromise

Rotate the affected provider credential first, then update the protected runtime/environment secret and redeploy only the affected component. Supabase secret/service-role keys, database URLs, Railway/Cloudflare tokens, recognition service secrets and provider credentials must never be sent to clients. Review logs and audit events for use during the exposure window.

## Recovery Drill

At least one staging drill must cover database restore, gateway rollback, Railway rollback, model/index rollback and EAS rollback. Record measured time, data loss, failed steps and corrective actions. Production RTO/RPO remain `not measured` until those drills are completed.
