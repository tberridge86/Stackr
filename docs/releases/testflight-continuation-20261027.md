# TestFlight release continuation — 27 October 2026

The owner explicitly requested proceeding through R2 closeout, authenticated testing,
scoped supporting service rollout, merge/build/submission, and installed-phone acceptance.
This supersedes the earlier missing-approval status for that named scope. It does not waive
technical acceptance, access controls or expand to unrelated migrations/jobs/paid services.

Candidate: PR #446, d76f5099f1cb1811df01b3eace6532d8eaf83a59. It remains unmerged.
Five exact-source hosted workflows passed; nine active Platform jobs passed.
The skipped WP32 release-candidate assessment is a separately frozen 1.0.3 programme;
the workflow explicitly says it must not block unrelated scoped mobile maintenance.

## Newly verified

At 16:15:32 UTC the live backend attested source 7c1acd409680 (bundled workflow SHA),
deployment dfc23b30-9675-4ba0-ad2b-9f1875302747, production/oakdbbzdqwurpjnoqhmu.
The existing public delivery gate passed at 16:16:22 UTC: catalogue manifest,
Pokédex continuation, four translated card identities and compatible activity schemas.
This clears the former local DNS blocker, not authenticated or installed-phone acceptance.
Public samples were slow (manifest 9.1 seconds; card requests 1.1–1.8 seconds).
No claim of improved actual Home speed is established.

R2 is verified complete for the eligible scope: 62,098 / 62,098, zero source rows at
16:44:39 UTC. Original/derivative pointer checks passed across four exhaustive disjoint
UUID ranges (separate read-only snapshots). The durable receipt chain passed for all
135 B-run batches, and 13 public GET checks across 11 distinct objects passed status,
MIME, length and SHA256. This is sampled public retrieval, not a full GET audit.
[Final closeout evidence](https://github.com/tberridge86/Stackr/blob/35c49c309637717fe968606f0e97adfbd17ff5cd/docs/releases/r2-eligible-closeout-20261027.md)
is recorded in PR #448. The completed transfer watcher is paused; no source files were deleted.

## Remaining execution gates

1. Designated QA credentials/session are unavailable here. The approved desktop harness
   reads D:/workspace/stackr-qa.local.json privately (email/password); never commit or paste
   it into chat. Dashboard authentication is not an application session. Home measurement
   alone does not prove account switching, edits, offline behavior or rendered screens.
2. Capture current Cloudflare worker version/deployment and Durable Object identity plus
   rollback receipt. Current tools have no Cloudflare account access.
3. The GitHub connector provides workflow reads/reruns but no workflow dispatch. No local
   authenticated GitHub/EAS/Cloudflare CLI is available. Use the existing authenticated
   release execution path; do not add a second deployment workflow or expose tokens.
4. The search SQL signature was freshly absent at 16:15:25 UTC. It remains unapplied;
   establish QA baseline and rollout readiness before applying only the pinned proposal.
5. Build from a clean, merged, exact revision using profile **production**, not
   production-owner, for existing **Team (Expo)**. EAS allocates the next build number.
   Last attested distributed app remains 1.0.6 (61). No new native build/submission occurred.
6. Complete actual iPhone acceptance after distribution; it cannot be certified here.

No application merge, SQL mutation, backend/gateway deployment or native submission
was performed in this check. Existing dirty backend security work was preserved.
Use testflight-readiness-evidence-20261027.json for the sanitized observation receipt.
