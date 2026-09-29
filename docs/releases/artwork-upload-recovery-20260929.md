# Artwork upload recovery — 29 September 2026

The approved 7,911-front release is blocked by transient Storage connection exhaustion. This repair retains the exact approved cohort, immutable object keys, source permissions, existing release workflow and both database rehearsals.

## Observed failure

- Source: `5c019b9d16816d7a702435b1df77d7c0927be2cc`.
- [Production run 36533384149](https://github.com/tberridge86/Stackr/actions/runs/36533384149), job `109291877602`, stopped at 2026-09-29 07:02:34 UTC with `Upload failed`.
- Immutable receipt artifact: `11016888757`, SHA-256 `19107c02b623d0b555dedf91213a3bf8bae6371fd97384e8a739c8cf8c813424`.
- The receipt verified all 31,590 local storage objects. Both staging and production rehearsed 7,911 assets and 7,911 links, then rolled back successfully.
- Storage attempted 114 objects; 112 were uploaded and byte-verified. Catalogue assets and links were both zero. Receipt status: `failed_before_publication`.
- Production Storage logs for 06:55–07:03 UTC show HTTP 429 responses during the failed uploads, with Postgres `08P01` and `no more connections allowed (max_client_conn)`. A nearby public read recovered from the same temporary failure. This is evidence of connection exhaustion, not a source-identity or permission failure.
- The independent production query at 07:01:09 UTC found zero new catalogue assets since the earlier recovery snapshot. Storage objects alone do not establish API publication.

## Bounded repair

The existing publisher now retries transient upload and public-read failures with at most eight attempts, waiting 2, 4, 8, 16, 30, 30 and 30 seconds. It uses two concurrent objects instead of three, closes its idle catalogue database connection during storage work, and reconnects before the serializable publication transaction and identity revalidation.

Uploads retain `upsert:false`. A resumed upload that returns an existing-object conflict is accepted only after its exact public bytes, format and dimensions pass validation. Authentication, permission, invalid-input and content-mismatch errors fail closed. Receipts retain successful upload state even if subsequent verification fails, record retry counts, and emit only bounded status/progress details rather than upstream response bodies.

The cohort SHA-256 remains `20f4d3b1e5673f494c05c0330257296f78e3b35c21b06254523dfb066ea2f2cd`. Approval, original archives, image identities, schema, holdings, pricing and release protections are unchanged.

## Validation and delivery

23 focused publication tests passed locally, including temporary HTTP 429, SDK-wrapped network failure, lost-response/409 recovery, bounded permanent throttling, authorization refusal and byte-mismatch refusal. Existing frozen-plan, source-permission, identity, original-key uniqueness, manifest and rollback tests also passed. Repository diff validation passed. CI, merge, production retry and final API delivery remain separate required states.

Continue through the existing protected `deploy-production.yml` lane with `release_scope=artwork3303` at the exact reviewed merged main revision. Reusing an old failed run would reuse its old source, so it cannot deploy this correction. A fresh successful receipt must prove 7,911 published manifest entries and public bytes before the release can be marked delivered. Installed-device rendering remains unverified.

## Remaining artwork after this approved batch

These figures belong to the frozen 12,161-printing recovery list, not the whole catalogue or metadata completeness.

| Language | Prepared in the approved release | Unresolved outside this release |
| --- | ---: | ---: |
| English | 471 | 713 |
| Japanese | 2,398 | 2,221 |
| Traditional Chinese | 5,042 | 248 |
| Simplified Chinese | 0 | 829 |
| Korean | 0 | 239 |
| Total | 7,911 | 4,250 |

Of the 4,250 unresolved cases, 3,530 need exact sources, 52 have missing or inadequate source images, and 668 require language, printing or artwork decisions. The card-by-card source is `artwork4250-exceptions-20260928.json.gz`.

A separate current API-manifest absence query at 06:55:14 UTC returned 12,162 printings (EN 1,185; JA 4,619; TW 5,290; SC 829; KO 239). Its one-record difference from the frozen list still needs population reconciliation; it must not be silently subtracted from or added to the approved plan.

The owner's delivery target is usable production Stackr API data before the 1 October launch. The wider [October release queue](october-1-2026.md) also records 94 new set records without card checklists and the native/device acceptance still required. This upload repair does not close those gaps.

Reference: [Supabase Storage error codes](https://supabase.com/docs/guides/storage/debugging/error-codes), checked 29 September 2026. The official guidance identifies legacy HTTP 429 with exhausted Storage pooler clients; no pool-size or paid-plan change is included here.
