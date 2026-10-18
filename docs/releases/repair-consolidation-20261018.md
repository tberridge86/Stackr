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
object checks; all 104 registered unique commit heads are present. The original
checkout's 3677 captured working files (2295652088 bytes) were separately
restored with exact hashes, exact staged index and applicable unstaged patch.
Unclassified ignored material and dependent paths still hold the original
primary checkout. Its migration is last.

Four named supplied source batches were copied and hash-verified (1208 files,
1123117559 bytes). The original `41 BRANDFALLBACKS`, `MISSING ARTWORK` and
Traditional Chinese six-per-page source folders were independently copied,
restored and moved reversibly under
`design-sources/original-folders-20261018/archived` (578 files, 1106823876 bytes).
Clean old Git worktrees are archived only after current status/head checks,
necessary ignored-material recovery and actual Git move/back/move verification.
The private current locations and restoration registries record exact paths.

Dirty/unknown work, dependency junction targets, the old shared Git primary and
large unclassified evidence remain preserved until their respective checks
pass. Reversible archival does not reclaim disk space. No permanent deletion
has occurred; any deletion proposal must name exact paths and recovery evidence
for the owner's approval. No blanket removal, reset or overwrite is permitted.

Before a release, also reconcile existing promised artwork batches, including
the original-front batch tracked in PR #339. This candidate's local assets do
not silently close or replace earlier delivery obligations.
