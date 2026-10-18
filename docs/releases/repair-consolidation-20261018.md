# 18 October video repairs and workspace consolidation

Tif coordinates both approved plans in the independent `D:/Stackr` repository,
on `codex/stackr-repair-consolidation-20261018`. The initial runtime repair is
`bb9f41030a63274f79004e787ab9bb2f5a2fc89d`; search artwork batching is
`66156ca9893e8767a4e594173f63accae015354e` and gateway circuit isolation is
`8b5ebc753ade3feaf574b21a8b6b01efa79ad582`, based on remote main
`f9350f896375ffac84a22ca2f7a4ec7654538091`.

PR #409 merged as `4e405d7b95dce08d71bdbd42ad5e4e6f3b829a07` after the
owner's explicit approval. The approved gateway-only release is live at that
revision. The owner reports installed TestFlight **59**; its retained signed
archive uses the earlier `f9350f8` client and old Storm logo. App-side repairs
remain unsigned and unpublished. See the
[live release receipt](gateway-live-delivery-20261018.json) and
[build 59 reference](phone-build59-reference-20261018.json).

The [23-issue register](video-repair-register-20261018.json) is the closure
record. It distinguishes demonstrated source causes, live diagnosis, exact
identity/source blockers and installed-phone acceptance. **No issue is closed
on source tests, an API sample, or build availability.** The recording does not
identify a numeric phone build. Approximate timestamps refer to the 292-second
18 October WhatsApp recording, SHA-256
`a29ad89ce8cec90b3dfa299c5a951ff4b60d686187f5a27c03a4e6175d1e859c`.

## Implemented repairs

- Saved binders hydrate images independently of live ownership confirmation.
  Serialization had lost private canonical artwork handles. Recovery now reads
  complete canonical facts for the saved set/language, validates the saved
  printing, variant, finish and catalogue version, and attaches images only to
  exact matches. A one-card saved subset cannot truncate canonical pagination.
  Ownership, quantities and prices remain governed by the live account model.
- Saved/pending ownership and verified foreign ownership have distinct wording.
  Optional custom-name artwork cannot block essential binder facts. Cancelled,
  superseded and old-account image callbacks cannot replace fresh binder state.
- Binder summaries recover verified set denominators independently of prices.
  Failed price retrieval is distinct from a genuine absent quote. Transient
  failures retain previous values with Retry; access denial clears the whole
  relevant account summary cache. Shared-query cancellation and mixed
  denial/server-failure ordering have regression coverage.
- Value History uses bounded, independent market/collection reads. Valid
  same-day comparisons survive; ambiguous variant comparisons fail closed.
  Optional previews follow facts. Prepared aggregate history and validated
  same-owner saved Home history retain their actual coverage/freshness labels.
  The latter explicitly says holdings and freshness have not been rechecked.
  Aggregate holdings do not establish individual card movers or past holdings.
- Pokédex partial fallback preserves the canonical error through the existing
  progress field, so Retry remains available. Search distinguishes retained
  cards from a successful fresh card read, preserving independent result groups
  and current-query settlement guards.
- M6 selects the owner's exact English-lettered Storm source. The owner's
  direct permission is bound to its hash in the rights receipt. Three supplied
  Traditional Chinese pack images provide artwork fallback; they are not
  presented as standalone logos. Previous immutable assets and receipts remain.
- Search artwork now requests at most 100 exact printing IDs per manifest
  batch, with bounded pagination under the existing optional deadline. Factual
  cards remain usable first; completed artwork pages survive later failures.
  The regression changes 100 singleton requests into one batch while retaining
  exact variant/edition rules, cancellation and concurrent-query isolation.
- Optional asset manifests have a separate fixed gateway circuit. Five failed
  image requests can no longer block healthy factual routes or reset their
  failure count. Existing failure thresholds, cooldowns, retries, authentication
  and cache rules remain. This gateway change is tested, reviewed, merged and
  deployed through the existing guarded release process.

## Validation and delivery

Root typecheck passed. Root lint passed with zero errors and eight existing
warnings. Focused binder reopening (27 cases including SQLite persistence),
serialized saved artwork, binder values/counts, actual Value History screen,
collection pricing, Pokédex partial/account/loading, search recovery/settlement,
Japanese/Traditional Chinese artwork and CoroCoro interaction tests passed.
The additional chart-date regression exercises the rendered tracker. A whole
source secret scan passed across 3701 text files before the final evidence
updates. All 55 gateway tests passed, with no skips, after restoring the exact
locked dependencies. The existing local Worker dry-run build also passed;
no upload occurred. No backend runtime files changed in this candidate.

The existing candidate workflows now run `npm run test:feedback-recovery`,
covering six focused recovery regressions. At approved revision `df8d86d`, all
12 applicable hosted checks passed; release-candidate and canary-API jobs were
skipped. Exact merged-main Platform CI, Gateway CI and Owner Pricing Identity
workflows then passed before dispatch. The reviewed changes are merged in
[PR #409](https://github.com/tberridge86/Stackr/pull/409). Skips and source tests
remain separate from live delivery.

Independent review findings were repaired and rechecked: exact Storm permission,
lossless raw Git patch capture, shared-query cancellation, mixed access-denial
precedence, serialized artwork recovery and saved-subset pagination. The review
does not establish live or physical-phone correctness.

The final local production iOS export passed. The
[export receipt](ios-export-asset-verification-20261018.json) verifies all four
selected source assets byte for byte in the actual exported asset map and bundle
metadata. Bundle SHA-256:
`d2f8302a0f99026e284387224cef9f51ef3a5aad85014360ec782d897ef251db`,
exported from search runtime revision `66156ca`. The previous export is retained.
This is an unsigned local export. The exact M6 API/image response was separately
verified. Merge and gateway publication subsequently completed; broader image
coverage, signed native publication and installed-iPhone Wi-Fi/mobile journeys
remain separate gates.
Existing performance targets and required sample sizes remain unchanged and
unmeasured by this work; no percentile claim is made.

The [normal-production native candidate](native-release-candidate-20261018.json)
is prepared for already merged source `4e405d7`, separately from the deployed
backend `f9350f8`. Its app/configuration bytes match the verified export. The
existing local EAS 23.2.0 route confirmed the same account identity as delivered
59; an initial 30-second metadata timeout is retained beside the successful
bounded follow-up. All 17 prepared files and 15 executable/configuration helper
hashes passed independent review. Offline validation passed 101 launcher cases,
five unknown-outcome holds, ten synthetic archive cases and 14 syntax checks.
No native build or submission has started. Separate publishing approval was
requested after preparation and review.

The approved execution would run fresh existing delivery gates, verify all 73
promised assets in the actual signed app, then submit that exact finished build
ID to the existing internal Team (Expo). A separate fresh public/mobile/history
check is required before submission after a long build. Initial receipts and
unknown outcomes remain immutable. The history schema reads return no collector
rows. Normal production preserves build 59's audience; the owner-recognition
profile is separate. The actual next build number comes from fresh inventory.
The earlier 970-item artwork backlog recorded in PR #339 remains disclosed and
has not been reverified as a whole batch or closed by this candidate.

## Live and source gaps

The sampled Storm factual-card request returned `504 downstream_timeout` in
about 8.8 seconds (request ID `803bc925-ddd5-436c-8eb0-fd798b5eb93e`,
2026-10-18T10:04:09Z). An earlier sample returned 113 facts successfully, which
does not establish reliability. A Traditional Chinese asset-manifest sample
also timed out. Two existing pricing workers reported database statement
timeouts. They were not restarted and no provider refresh was triggered.

A subsequent public Storm image download returned HTTP 544 with the explicit
`DatabaseTimeout` message, repeated on a second bounded read. Its logo manifest
returned another downstream 504. The project control plane reports healthy,
which does not establish successful database/storage reads. The
[read diagnostics](live-read-diagnostics-20261018.json) retain these observations;
the precise database/query cause and its relationship to each video symptom
remain unproved.

The owner approved the [bounded read-only SQL](diagnostics-20261018-read-only.sql),
and the checks completed. The initial tool response exposed only the final
row-producing result, so the five earlier unchanged checks were collected
separately in the same read-only/deadline/rollback wrapper. One further point
sample reused the same approved wait-state statement: seven SQL tool calls in
total. The [diagnostic report](production-diagnostics-20261018.json) records
each call and the interpretation limits. No writes, provider refreshes, worker
restarts or deployments occurred. The prepared valuation route is not probed
with an authenticated GET because it can enqueue preparation even without a
provider refresh. Unrelated staged API credentials must not be swept into a
deployment.

The two activity samples show 13 then 17 idle ClientRead sessions and one active
session without a reported wait. The facts EXPLAIN is indexed but contains only
estimates; it does not establish runtime or API/Storage health. Several actual
physical table names are absent from the approved index-filter list, so the
metadata cannot establish missing indexes. No timeout root cause is confirmed.

At 13:33 UTC the same public facts request returned three cards with HTTP 200
in about 2.3 seconds. The source Storm PNG returned HTTP 200 and all 900649 bytes
match the supplied hash. These point successes do not close the intermittent
failure or phone journeys. The production logo manifest returned an empty
asset list: the historical r7 import retained the source in the logo library,
but left its production canonical set association null after the recorded
staging UUID failed the guarded production match. A one-asset association repair
has now been applied under the separate existing exact-artwork authorization.
The exact M6-only transaction committed one asset and one existing-version
membership, reusing the unchanged public PNG. All 13 focused preparation/guard
tests passed, including isolated PostgreSQL publication, rollback and rejection
cases; independent review passed the exact frozen SQL. The transaction retained
five-second statement and one-second lock limits. It changed no set, printing,
variant or version records, refreshed no prices and uploaded no new object.

After the old default caches and bounded in-flight reads could expire, both
normal per-set logo API URLs returned the exact single approved M6 asset. The
selected image response matched all 900649 original bytes, hash and 1280x544
dimensions. The [publication receipt](storm-m6-publication-20261018.json) records
the exact operation, rollback and API evidence. The old Japanese bundled asset
and original source remain retained. Signed native delivery and visible
Discover/binder phone acceptance are still open; the generic matcher was not
loosened.

The owner separately approved four corrected follow-up checks, which all
completed once. The first index filter used outdated table names. Its follow-up
returned 42 index definitions across six corrected physical tables, the
stored-price view definition, and estimated plans matching first-page per-set
logo and known-version card facts reads. The
[follow-up report](production-diagnostics-followup-20261018.json) preserves the
exact scope and result hashes. These are metadata and estimated plans, not
runtime or private collection-price evidence. No timeout cause or missing-index
repair is established, and no refresh, restart, deployment or database schema
change was performed.

Fresh [public retrieval checks](public-retrieval-verification-20261018.json)
enumerated 42 distinct Wartortle printings across four published language
versions in two pages. The first page has 16 cards and a continuation cursor;
an exact current-client replay follows it and emits 42 complete. This does not
establish the historical installed-build cause or a broader expected population.
For the first 16 printings, one complete manifest yields 14 eligible artwork
presentations. Two actual thumbnails fully decode and match their declared
hashes. Japanese web1 #024 needs an approved exact source; English Base Set #42
normal points to first-edition artwork, which the existing identity guard
correctly refuses. Neither gap is repaired with an unrelated image.

Fresh public Pikachu searches returned 100 all-language and 16 Japanese factual
cards, with no embedded variant images. These current successes do not establish
the recorded failure cause or optional thumbnail/listing-media delivery.

One subsequent manifest request for the 95 distinct printing identities in the
100-card search returned `503 downstream_circuit_open` in 426ms, before reaching
the origin. This does not measure successful batch latency. Source reproduction
confirmed that asset manifests and factual backend routes share a circuit;
the separate [gateway repair](gateway-circuit-isolation-20261018.json) fixes that
coupling. Its four new regressions failed on the original source and passed
after repair; independent review passed. The preceding production failures that
opened the observed circuit remain unknown. One bounded Railway log read for
14:14–14:19 UTC, filter `catalogue`, returned zero matching entries; this filtered
absence is not proof of a healthy origin. The
[search repair receipt](search-artwork-batching-20261018.json) retains the failed
live probe alongside local validation.

Before the approved release, read-only gateway metadata identified deployment
`946af123-25ca-4a8b-89f1-e441b52f8bb0`, version
`71032825-4494-46c2-82b0-de3a21d6953d`, at 100% traffic, tagged to source
`ea8190f3a0bda642e266438b68f19d4f398f7845`. Its durable-object namespace matches
the existing release guard. The only gateway runtime difference between that
tagged source and this candidate is the reviewed proxy circuit change. The
[gateway release plan](gateway-circuit-release-plan-20261018.md) retains exact
approval, current-main checks, rollback and post-deployment verification gates.

The owner explicitly approved the merge and gateway deployment. Guarded run
[39147311549](https://github.com/tberridge86/Stackr/actions/runs/39147311549)
completed successfully. Version `56f04b7f-0692-4d8f-a9ae-0963442e57b8` is at
100% under deployment `edc59e4a-b404-449d-a26a-e61784ceacfd`, tagged to merged
source `4e405d7`. Health/readiness returned 200; all four anonymous private-price
checks returned 401, including the rejected refresh request. No provider refresh
occurred. Fresh custom-domain, runtime, observability and durable-object checks
and independent release review passed. No backend, native, database, credential
or job change was included, and rollback was not needed.

A single reviewed eight-GET public capture then returned HTTP 200 throughout.
The exact Storm PNG decoded at 1280x544 and matched all 900649 supplied bytes.
The same 95-printing Pikachu image batch that earlier returned 503 now returned
105 assets in 557ms (558ms whole manifest stage, within the unchanged two-second
optional deadline). The unchanged resolver accepted artwork for 98/100 factual
rows: 63 exact and 35 approved shared. Only one stricter same-printing/default-
variant thumbnail was fetched and decoded; resolver eligibility does not prove
98 successful image downloads. Jungle #60 first-edition and My First Battle #17
normal remain exact artwork gaps. Wartortle returned 16 and 38 rows across two
pages, 42 distinct printings across four current published versions. This is
not a universal inventory denominator. Pikachu facts took 3532ms in this one
sample. These points do not establish sustained recovery, historical causality,
performance percentiles or phone rendering. The live release receipt preserves
the exact evidence, limits and remaining gaps.

The asset-manifest regression was also corrected to execute the current
September 27 identity RPC in isolated in-memory PostgreSQL, rather than relying
on the older September 6 fixture. Printing/variant membership, rights and
publication exclusions, multi-version cursors and three negative controls pass.
This changes test coverage only; no query optimization or live latency cause is
claimed.

Home's unidentified Japanese printing, the exact November 2023 CoroCoro cover
and rights, broader expected Wartortle population, affected listing media,
per-card movers, fresh exact-card prices and recorded-phone acceptance remain
open. March 1999's two specific references, full-resolution final Pikachu
inspection and tactile haptics need the explicit acceptance journeys. No
artwork, identity, quote or completion denominator is invented.

## Preservation and consolidation

`D:/Stackr-organization` holds private source/evidence and recovery material.
`scripts/stackr-workspace-inventory.mjs` records Git metadata and byte-exact raw
patches without changing a source checkout. Metadata alone is not a backup.

The original all-refs bundle was independently restored and passed full Git
object checks. All 104 distinct commit heads from 111 registered worktrees are
present and protected by private preservation refs against pruning. Across 18
working snapshots, 13,862 captured file copies (4,197,961,088 bytes) were
restored with exact hashes, staged-state checks and applicable unstaged patches.
These are file copies across checkouts, not unique files or a claim that every
ignored file is backed up. The primary accounts for 3677 of those working files
(2295652088 bytes). Additional private configuration and signing material has
separate recovery proof; it is not committed here.

The two standalone repositories also have independently restored Git objects.
The nested metadata-provider checkout is shallow: its standalone bundle cannot
be cloned independently, so a separate verified local bare clone preserves its
exact shallow boundary instead. The native checkout's pre-existing absent index
and initialization locks remain untouched; a separate scratch restoration
reproduces its actual state. These exceptions remain explicit in the private
receipts. Unclassified ignored material and dependent paths still hold the
original shared primary. Its migration is last.

Four named supplied source batches were copied and hash-verified (1208 files,
1123117559 bytes). The original `41 BRANDFALLBACKS`, `MISSING ARTWORK` and
Traditional Chinese six-per-page source folders were independently copied,
restored and moved reversibly under
`design-sources/original-folders-20261018/archived` (578 files, 1106823876 bytes).
Twenty-five coding folders have now moved under the organization archive:
18 clean linked worktrees, five linked worktrees with preserved changes, and
two standalone repositories. Every move was reversed and repeated successfully.
The dirty moves preserve working and staged fingerprints; the standalone moves
retain independent Git metadata and objects. Separately, 7760 necessary ignored
source/export/evidence files (3501108635 bytes) have both preserved and restored
copies. Packaged export directories named `node_modules` are retained evidence,
not assumed dependency caches. A classification addendum supplements the
immutable original receipts without rewriting them.

The private current locations and 25-entry restoration registry record exact
paths. The restoration tool supports linked and standalone repositories and
rejects unexpected working/index states. Shortcuts and the current
`D:/Stackr-organization/START-HERE.html` map point to the recorded locations;
the original 5 October map remains as historical evidence. The
[preservation summary](workspace-preservation-20261018.json) provides sanitized
counts and receipt hashes; private configurations, captures and source receipts
remain on disk.

Two small flat evidence folders, `Stackr-stage6-review` and
`Stackr-rebuild-evidence-31031383876`, were also independently copied, restored
and moved/back/moved under `evidence/original-folders-20261018`: eight files,
3356672 bytes. Their private receipt contents are not published. These moves
are separate from the 25 coding-folder relocations.

A bounded post-move audit inspected 120 existing roots and 85 root/direct-service
dependency junctions. It found no broken links caused by today's relocations.
Seven older broken links were repaired after independent review and a passing
private Windows fixture; each original junction is retained intact for rollback.
All four affected checkouts retain exact HEAD, working and staged fingerprints.
One pre-existing Wrangler root link remains held because its exact mapped
dependency directory is absent. No substitute dependency tree was invented.
The first private fixture exposed an absent-target recreation limitation before
any source change; its failed evidence and the revised reviewed proof remain.

Remaining changed or unclassified work, dependency junction targets, the old
shared Git primary and large source/data/evidence roots remain held until their
respective checks pass. Model and recognition data retain provenance and
consumer paths; mixed-project
`D:/CodexTemp` cannot be moved wholesale. The current hold matrix is private
`evidence/consolidation-20261018/remaining-data-roots.json`.

The secure backup folder now has a separate exact eight-file encrypted copy,
a fresh private extraction of 107 files (461026376 bytes), and successful checks
against all 106 internal manifest hashes. After independent review, the original
archive, protected key and recovery files moved together to
`D:/Stackr-organization/backups/secure-recovery-20260730`; an actual inverse move
and repeat relocation passed all eight fingerprints. The recovery script uses
its own folder. This proves local archive recovery, not a remote database restore
or recovery under another Windows account. Private plaintext contents are not
published.

The historical approved Home source packet moved separately under
`evidence/source-release-packets-20261018/Stackr-release-queue`. All 17 original
manifest hashes match; the complete 20-file packet (417563 bytes) has two exact
copies and passed move/back/move verification. The original manifest and paths
remain historical evidence, with a current-location note in its maintained
handoff. The packet is not applied over newer pricing or account safeguards,
and its pending phone acceptance is not closed by relocation.

Reversible archival does not reclaim disk space. No permanent deletion
has occurred; any deletion proposal must name exact paths and recovery evidence
for the owner's approval. No blanket removal, reset or overwrite is permitted.

Three additional non-Git native source/export roots (`mobile-eas-build-check`,
`mobile-eas-build-camera-20260826`, `mobile-eas-build-slim`) moved under
`archive/native-source-snapshots-20261018` after independent review. Their 4250
ordinary files (1754954518 bytes), empty-directory structure and three root
dependency junctions have two exact copies. Each original tree passed complete
file/directory/junction fingerprints before and after every move/back/move leg.
All private configuration and packaged exports are retained. Dependency targets
were never traversed; each root junction still names `D:/Stackr-1/node_modules`,
which must migrate with the original shared primary last. The archived source
was not applied over the current app. These counts are a separate cohort and
overlap other retained copies; they are not unique-file totals.

The historical mobile release-artifact folder has also moved to
`archive/mobile-rc-artifacts-20261018` after two exact copies and an actual
move/back/move rehearsal: 3607 files, 2641290629 bytes and 340 directories.
All four named export manifests retain their asset references; no package or
archive was executed or published. The first verifier stopped before any move
on a Windows date-locale conversion. Its immutable failure receipt remains;
the corrected helper passed 34 cases across UK/US cultures, independent review,
a full fresh source verification and all six before/after movement checks.
The original shortcut is preserved and its current target verified. This brings
the total to **36 original folders reversibly relocated**, with no permanent
deletion or disk-space recovery claim.

Before a release, also reconcile existing promised artwork batches, including
the original-front batch tracked in PR #339. This candidate's local assets do
not silently close or replace earlier delivery obligations.

The five historical fallbacks and frozen preview have now moved together under
`archive/fallback-snapshots-20261018/Stackr-fallbacks`: 3134 files, 276884297
bytes and 261 directories including the root. Two exact copies and six fresh
hash/structure checks across an actual move/back/move passed. Packaged preview
fonts/assets named `node_modules` were retained. Independent review caught and
resolved missing ancestor/occupancy protection and stale consumer checks before
any move; a six-case Windows fixture passed the revised guards. No documented
preview listener or direct command-line consumer was observed immediately before
each leg; process working directories and environments were not inspected.
These are recovery checkpoints containing historical uncommitted work, not
source to overlay onto the maintained app. Their selective-restoration guidance
remains with the originals. This brings the total to **37 original folders
reversibly relocated**; no permanent deletion or space recovery is claimed.
