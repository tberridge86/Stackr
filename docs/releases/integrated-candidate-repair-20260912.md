# Stackr integrated candidate: release-blocker repairs

Updated 12 September 2026, 16:11 UTC. Source candidate:
`f0f1405831e12224a0a8df7e6ccfd4747f01a923`, on local branch
`codex/stackr-integrated-candidate-20260912` in
`D:/Stackr-integrated-candidate-20260912`.

The combined candidate now includes fast binder retrieval, the latest browsing
and Home UI, the pricing request-storm fix, Japanese search, verified English
set-logo assets, scanner cancellation protection and the recovered production
migration source. It is **not deployed or approved for production**. Traditional
Chinese artwork, real pricing availability, exact deployed service versions and
physical-device acceptance remain unresolved.

## Source chain and concrete repairs

The [first checkpoint](integrated-candidate-20260912.md) retains the integration
of main `4c0be1a` and PRs #184, #187 and #180. Subsequent work is additive:

| Source | Result |
| --- | --- |
| PR #190 `833b537e7cc60d6474ef812c2baa874e36615d0e`, local merge `d5568ad` | 15 verified English image binaries and 47 aliases; explicit language guards preserve Japanese identities. Shared McDonald's/POP assets are not counted as distinct exact-set logos. |
| `eb087909f80de1845f46a755d36100891c5b0d80` | Gateway accepts and validates `includeAssets=false`, `true`, or omission; facts-only, enriched and default responses keep separate cache identities. Missing, malformed or mixed catalogue versions are rejected before normalization and on disk; adapters retain version provenance. |
| `1403ed09e464830f9bcb9310bd92af84075c44e8` | Backgrounding, route blur, close, unmount or a newer capture invalidates pending scanner work. Late awaited stages cannot navigate or overwrite a newer scan. The async regression exercises the same awaited-stage helper used by recognition. |
| `0a1df253e8849a6dfb6bc59a5d6e516dc0e70956` | Selectively restores PR #188's six historical SQL files, original evidence and byte-verification test; preserves current package scripts. No database statement was executed. |
| `f0f1405831e12224a0a8df7e6ccfd4747f01a923` | Fixes a reproduced Chinese/Japanese shared-code collision: an explicit foreign language cannot receive a Japanese logo, including through fallback language or a conflicting legacy prefix. Japanese locale/script tags and language-omitted legacy lookups remain supported. |

The retrieval defects were reproduced before repair: the gateway regression
returned 400 instead of 200, and missing catalogue versions passed validation.
The repaired tests now pass. Complete prior binder snapshots survive invalid
refreshes, retaining ownership quantities and account/environment boundaries.

The six restored migration statements match their recorded production bytes
6/6; the five earlier search migration statements also match 5/5. The original
[ledger receipt](backend-migration-ledger-reconciliation-20260912.md) remains an
11:20 UTC observation of its own base (130 to 136 files). This combined candidate
has **137** migration files because it also includes PR #180's proposed binder-RLS
migration. None of these source counts establishes live alignment.

Windows checkout line endings initially broke exact SQL hashes and security
fixtures. `.gitattributes` now preserves canonical LF for migration SQL and
staging overrides. Existing worktree SQL was checked against its committed blob
before restoring line endings; no existing SQL blob or hash expectation changed.

## Verification and its limits

Windows, Node `v24.15.0`, existing root/gateway dependency junctions. This is not
fresh Linux/Node 22 CI. The app source built and tested at `1403ed0`; the following
source-recovery commit changes migration history, line-ending policy and the
database test command only. The subsequent `f0f1405` language-guard change passed
TypeScript, app lint, scoped lint and the expanded resolver regression; the full
web export remains evidence for the earlier `1403ed0` app checkpoint.

| Check | Observed result |
| --- | --- |
| TypeScript and app lint | PASS; lint has 0 errors / 12 existing warnings |
| Gateway tests | 41/41 PASS, including actual request forwarding and cache separation |
| Complete-set retrieval | 13/13 PASS |
| Binder reopening | 18/18 PASS, including file-backed SQLite, account isolation and invalid refresh retention |
| Scanner pipeline, recognition orchestrator, local inference and scoped scanner lint | PASS; no physical camera or model accuracy claim |
| API contract and route coverage | PASS, 38/38 operations |
| Binder catalogue, personal loading, Home release and collection-pricing UI | PASS on combined source |
| Native-language display and Japanese logo coverage | PASS |
| Full English logo verification | PASS: 15 canonical binaries / 47 aliases, including file hashes and resolver tests |
| Database migration/security fixture suite | PASS, all seven constituent scripts, including 11 exact recorded SQL hashes |
| Web export | PASS; 2,538 entry modules bundled and routes exported to `dist` |
| Exported bundle secret scan | PASS; 103 bundle files scanned |
| Browser startup | Local exported app reached the rendered login screen with brand assets and controls; signed-in Home and camera were not exercised |
| Full deployment-tooling test | INCOMPLETE: sparse checkout omits tracked files required by the repository-wide secret scanner |

The English asset check first encountered the Windows Python launcher alias.
Using the already-bundled Python runtime on the command's PATH resolved it; the
full package script then passed. No asset was downloaded or altered by that check.

The language-guard regression first reproduced `zh-tw` resolving to the bundled
Japanese `s8b.png`; it now passes six explicit foreign language labels, eleven
Japanese aliases/locales, legacy lookups and the actual shared artwork resolver.
Independent English asset, Japanese coverage and native-language checks also
passed. Scoped lint retains two pre-existing array-style warnings. No Chinese
logo was substituted to make the foreign-language test pass.

PR #188's failed `benchmark-smoke-tests` job was traced to a later deployment
test's stale `staging history + 25` assertion (105 + 25 = 130), not the benchmark
tests themselves. PR #180 already replaced that assertion in this candidate with
the actual source-file count, retaining all six reconciliation failure reasons
and the blocked alignment gate. A read-only verifier reports 137 source files;
the full deployment test still requires a complete checkout to finish its secret
scan. Neither the scan nor a deployment gate was weakened.
The [deployment-check receipt](evidence/integrated-candidate-20260912-repair/pr188-deployment-check.md)
records the upstream job and the exact remaining local blocker.

[Updated SQLite receipt](evidence/integrated-candidate-20260912-repair/binder-reopen-tests.json)
and [validation log hashes](evidence/integrated-candidate-20260912-repair/validation-log-hashes.json)
preserve evidence. Logs remain under `outputs/integration-validation-20260912`.
Fixture timings are not iPhone tap-to-visible-card p95 measurements.

## Artwork coverage and source recovery

The last usable-card-image-reference census remains the 14:08 UTC observation
in [the artwork evidence](artwork-integration-evidence-20260912.md):

| Language | Usable references / active variants | Coverage |
| --- | ---: | ---: |
| English | 31,211 / 33,168 | 94.10% |
| Japanese | 8,620 / 13,771 | 62.60% |
| Simplified Chinese | 19,431 / 20,408 | 95.21% |
| Traditional Chinese | 2,382 / 8,166 | 29.17% |

These are recorded references, not successful image renders or an audit of every
historic official printing. Traditional Chinese needs at least 1,702 further
usable references to exceed half of the current variant denominator. No such
ready, approved bulk-persistence pack was found in the collated work.

The release coordinator's later 15:25 observation reports published Japanese
set logos at 139/163. English remains 141/217, and both Chinese published
set-logo counts remain zero. These database publication counts are separate
from bundled assets and permitted live provider references.

Traditional Chinese Actions artifact `10299719637`, run `34701847752`, was
preserved locally before its 15 September expiry. Its SHA-256 is
`7195a3f5acfed6c58beb57fc2c5b5ffb7be4773691979af70de8da59424af86b`, matching GitHub's
digest. The archive has 54 target rows, 25 distinct code/file candidate mappings
across 9 codes and 15 unique image byte streams, and **zero accepted/review-approved
rows**. It does not substantiate the earlier claim of 69 mapped candidate logos.
Some candidates are page backgrounds or composite product art.

The [artifact receipt](evidence/integrated-candidate-20260912-repair/traditional-chinese-artifact-receipt.md)
preserves exact provenance and counts. The ZIP and extracted sources remain at
`outputs/source-artifacts/traditional-chinese-actions-run-34701847752-artifact-10299719637`.
Nothing from this pending pack was imported into runtime assets or published.

A second existing archive, `chinese-logo-evidence` artifact `10299784767` from run
`34702564636`, was subsequently preserved and verified. Its 8,527,265 bytes match
GitHub's SHA-256 `e0d9ae9a2cc786b19927676f34cf7ced29b0ccbc1c3f66ab58a2d14242146de8`.
It contains five Simplified Chinese images explicitly labelled
`publisher_reference_not_logo` and `pending`; all five file hashes match. Its
Traditional Chinese evidence has 83 empty groups. It adds zero approved logos.
The [derived artifact receipt](evidence/integrated-candidate-20260912-repair/chinese-logo-evidence-artifact.json)
records the source pages and image identities without temporary media query tokens.
The separately claimed final 69-logo chat download is still unverified: it was
not available through task attachments, and the browser requires a ChatGPT login.

Existing approved TCGdex low-resolution, exact-identity, memory-only live card
references can fill some display gaps; they do not authorize bulk mirroring or
change the stored census. No permission override or new recognition model was
enabled to claim coverage.

A read-only trace confirmed that eligible controlled card references can reach
both set-detail and binder rendering through the current deferred enrichment and
overlay-preserving merge. No overlay-loss defect was found. The two-second binder
enrichment bound and capped detail fallbacks remain limits; this source review
does not prove current provider coverage or on-device artwork completion.

## Release boundary

The separate user-directed freeze remains in force. Main is locked at `4c0be1a`;
Railway services coupled to main make merging a production action. No upstream
push, PR creation, merge, unlock, catalogue/price refresh, database change,
deployment, OTA or TestFlight publication occurred in this continuation.

The requested exception for a **draft PR and GitHub checks only** remains awaiting
the user's answer. Production promotion is a separate decision after exact
service/build provenance, catalogue gaps, migration differences, fresh owned-card
prices and physical-device retrieval/scanner/UI evidence are resolved. The
existing TestFlight build is not evidence of this new candidate being installed.
