# 18 October video repairs and workspace consolidation

Tif coordinates both approved plans in the independent `D:/Stackr` repository,
on `codex/stackr-repair-consolidation-20261018`. The runtime repair commit is
`bb9f41030a63274f79004e787ab9bb2f5a2fc89d`, based on remote main
`f9350f896375ffac84a22ca2f7a4ec7654538091`.

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

## Validation and delivery

Root typecheck passed. Root lint passed with zero errors and eight existing
warnings. Focused binder reopening (27 cases including SQLite persistence),
serialized saved artwork, binder values/counts, actual Value History screen,
collection pricing, Pokédex partial/account/loading, search recovery/settlement,
Japanese/Traditional Chinese artwork and CoroCoro interaction tests passed.
The additional chart-date regression exercises the rendered tracker. A whole
source secret scan passed across 3684 text files. No backend/gateway runtime
files changed in this candidate.

The existing candidate workflows now run `npm run test:feedback-recovery`,
covering five focused recovery regressions. At source/evidence revision
`ad063a7c4357b1fd3de05f7d06893755b6cd20ab`, all ten applicable hosted checks
passed. The release-candidate and canary-API jobs were skipped; they are not
passes or live-delivery evidence. The draft review is
[PR #409](https://github.com/tberridge86/Stackr/pull/409).

Independent review findings were repaired and rechecked: exact Storm permission,
lossless raw Git patch capture, shared-query cancellation, mixed access-denial
precedence, serialized artwork recovery and saved-subset pagination. The review
does not establish live or physical-phone correctness.

The final local production iOS export passed. The
[export receipt](ios-export-asset-verification-20261018.json) verifies all four
selected source assets byte for byte in the actual exported asset map and bundle
metadata. Bundle SHA-256:
`e37e7563866a918a28961f72d8928018475a5242bc35984374ec69e90e89a02c`.
This is an unsigned local export. Merge, live API/image response, signed native
publication and installed-iPhone Wi-Fi/mobile journeys remain separate gates.
Existing performance targets and required sample sizes remain unchanged and
unmeasured by this work; no percentile claim is made.

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

The [bounded read-only SQL](diagnostics-20261018-read-only.sql) is prepared and
independently reviewed. Running remote database scripts requires the owner's
explicit approval under AGENTS.md; that request is pending. The prepared
valuation route is not probed with an authenticated GET because it can enqueue
preparation even without a provider refresh. Unrelated staged API credentials
must not be swept into a deployment.

Home's unidentified Japanese printing, the exact November 2023 CoroCoro cover
and rights, complete live Wartortle population, affected listing media,
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
respective checks pass. Secure backups need a fresh restoration proof; model
and recognition data retain provenance and consumer paths; mixed-project
`D:/CodexTemp` cannot be moved wholesale. The current hold matrix is private
`evidence/consolidation-20261018/remaining-data-roots.json`.
Reversible archival does not reclaim disk space. No permanent deletion
has occurred; any deletion proposal must name exact paths and recovery evidence
for the owner's approval. No blanket removal, reset or overwrite is permitted.

Before a release, also reconcile existing promised artwork batches, including
the original-front batch tracked in PR #339. This candidate's local assets do
not silently close or replace earlier delivery obligations.
