# Stackr integrated candidate: release-blocker repairs

## Current repair continuation — 19 September 2026

**State: READY FOR VERIFICATION, not released.** This is the one repair candidate
in the existing `D:/Stackr-integrated-candidate-20260912` worktree and
`codex/stackr-integrated-candidate-20260912` branch. Runtime source is
`2e3a3de4c6c44c475f7c40e23f1df6760bd2a42d`. Later receipt-only commits do not
change that runtime tree. The sections below this continuation retain historical
12 September observations; their freeze, deployment and coverage statements are
not current-state assertions.

The 18 September completion pack authorizes implementation, integration and
testing. This continuation resumes the queued repairs, including the scanner
configuration held for the next resumed work session. It does not extend the
12 September build-37 delivery approval to this new candidate. No protected-main
merge, database/catalogue write, price refresh, service deployment, OTA/native
upload or TestFlight distribution has been performed. No version/build number,
provider activation, scheduler setting, owner-access flag or release control was
changed. GitHub readback on 19 September found main `989da7d` with branch lock and
administrator enforcement false; those settings were left unchanged and must
not be represented as freshly verified protection.

### Exact inputs and ownership

| Owner | Input | Integrated outcome |
| --- | --- | --- |
| Release | Current main `989da7d489d4e127ac80a8798a1bf67367942954` | Fast-forwarded the existing integration checkout; reused already merged repairs. |
| Pricing | PR #207 `9811b93c988b3b8a6db623cdea4b20c80729d91f` (both commits) | Exact quotes, retained partial valuations, prepared generations/history and guarded resumable cycles. |
| Standard camera | PR #201 `342f4f1f82c0b7314a8116d204d05e4b30862589` | Expo-inlined public flags and paid fallback off by default; no owner-camera substitution. |
| Artwork | PR #208 `7945ce7c272797c823c2a10221c169f236d737bb` | Exact-original recovery, labelled same-printing ordinary-finish fallback and preserved first finish-edit quantities. |
| Japanese logos | PR #203 `5def395d394f1c5e83f81bc4b90e5c028c607ee5` | Complete Lost Link `ll` and SoulSilver `l1b` crops, manifests and guarded regeneration. |
| Chinese logos | PR #204 preparation `fe7104c809bc3eb8c2f4fae18be553f33c444e0c`, integration `2e3a3de` | Found the prepared local pack; copied 134 unchanged PNGs, mapped 123 exact zh-cn canonical UUIDs into the shared Discover/Add Binder/Binder resolver. |

The shared dirty `D:/Stackr-1` checkout was not edited. The existing uncommitted
`owner-integrated-testflight-20260912.md` in this worktree was preserved byte for
byte (SHA-256 `d16565153d11166c1bc1ea00f8e6fe7d9ac995ef77fe8590732b537a4e6854de`)
and is excluded from this continuation's commits. No worker commits were
rewritten. The release owner alone performed integration; independent reviews
found no actionable fault in the overlapping pricing/artwork Binder changes.

### Fixed acceptance scope and current evidence

| Required journey | State / evidence | Remaining owner and minimum action |
| --- | --- | --- |
| Correct GBP quote, source/time, language/finish identity | READY FOR VERIFICATION. Exact-quote, unavailable/stale, denied-provider, worker SQL/lease/backoff and prepared API tests PASS. | Pricing/release: apply the reviewed additive dependency through its authorized lane and trace a real authenticated stored GBP quote to the delivered app. No live refresh was run. |
| Home/Binder quantities and same-snapshot totals, partial refresh retention | READY FOR VERIFICATION. Home, binder retrieval/reopen/isolation, stable-price and prepared-route regressions PASS on combined source. | Release/device tester: verify real-account quantity changes, stale coverage and account switching after delivery. |
| Artwork, logos, full lists and master-set identities | READY FOR VERIFICATION for implemented resolver/quantity fixes. Master Set and image-recovery tests PASS; Chinese hash/dimension/identity tests PASS. The 123 mappings are active; 11 ambiguous images are bundled but deliberately not mapped. | Catalogue: resolve the explicit exceptions below. Device tester: inspect list/detail/Binder rendering, finishes and counts. |
| Ordinary production capture, honest identification/correction, persistent save | READY FOR DEVICE VERIFICATION. 24 flags tests (including all six actual Expo iOS/Android production transforms), orchestrator, scanner pipeline, automatic capture state, route/access, navigation serialization and collection-save tests PASS. | Release/device tester: distribute the exact standard-production artifact through the existing test route after authorization; record 10 repeated captures, supported/ambiguous/offline cases, denial/recovery/background-resume and save after reopening. |
| Existing quantities, binders and pending changes survive | READY FOR VERIFICATION. Combined binder reopen/rollback/account-isolation and real ownership-handler tests PASS. | Device tester: upgrade an existing test collection without clearing data and verify pending writes/reopening. |

App and backend TypeScript checks PASS; lint PASS with 0 errors and 12 existing
warnings. Gateway is 44/44 PASS; generated API/route coverage is 40/40 PASS.
The three constituent catalogue-pricing tests PASS. The declared PGlite 0.3.14
was missing only from this checkout's shared dependency junction; a temporary
resolver imported that exact installed version from the pricing worktree for
the unchanged SQL test. No shared dependencies or product source were changed
to obtain the pass. This is local fixture SQL evidence, not target-database
rehearsal or service-role production evidence.

[Verification and log hashes](evidence/integrated-candidate-20260912-repair/verification-20260919.json)
bind these checks to the candidate. Physical-device tests are NOT RUN.
The standard-production iOS Hermes export PASS includes 3,043 Metro modules,
716 asset references and the actual candidate routes. All 123 mapped Chinese
PNGs and both Japanese replacements were matched to their exported bytes.
The bundle SHA-256 is
`82a0af0c71e1e6dab1eff930b5387e2c9c98053675357a370deb07d067bed585`.
[Export receipt](evidence/integrated-candidate-20260912-repair/production-ios-export-20260919.json).
Bundle secret scan PASS. An earlier nominally successful 950-module/23-asset
export was rejected as incomplete; a clean `--clear` rebuild produced and
verified the full app. No product config or dependency changed for the retry.
No signed binary has been requested. Existing Platform CI now also runs the
Master Set artwork, Chinese pack and Japanese runtime lookup regressions.

The standard scanner's remote-engine boundary remains deliberately closed:
production disables local embeddings, primary Stackr vector recognition and
legacy/paid fallback. The checked-in model manifest is blocked, has no approved
ONNX weights/checksum, and its catalogue pack has no usable embeddings. No flag
was enabled to bypass that dependency, and the owner-only engine was not exposed.
Strong local OCR and explicit manual correction are the current supported
ordinary path. Device acceptance must prove that path. An expanded authenticated
model fallback remains externally blocked on its approved model/index/native
preprocessor and existing activation gates; it is not silently claimed as part
of this configuration repair, and creating a new model is outside this candidate.

### Exact artwork/logo exceptions and before/after

- Japanese M5/Abyss Eye 004, 015 and 019 resolve to their exact Japanese holo
  canonical identities in the existing complete 118-printing snapshot. Fresh
  delivery of all nine original/grid/detail representations returned 200 and
  matched the recorded SHA-256 bytes. [Exact identities and delivery](evidence/integrated-candidate-20260912-repair/m5-examples-20260919.json).
- Retried only the 186 previously failed exact-printing manifest reads, with two
  concurrent requests and bounded timeouts: **186/186 returned 200, zero assets,
  terminal pagination**. Thus the dated 245 no-face printings now comprise 245
  confirmed published-manifest gaps (59 earlier + 186 newly verified), with zero
  remaining transport failures in this cohort. This does not prove that no
  privately held source exists. [Read-only retry receipt](evidence/integrated-candidate-20260912-repair/artwork-manifest-retry-20260919.json).
- The artwork replay remains 245 to 303 default placeholders: 58 additional
  Base Set placeholders avoid 102 unverified edition-crossing aliases. Canonical
  card/finish counts do not shrink. These mappings remain OPEN for exact edition
  evidence or an explicit release decision accepting the disclosed placeholders;
  they are not counted as an artwork coverage improvement.
- Chinese before/after: 0 to **123 exact active logo mappings**, using the same
  shared resolver in Discover Sets, Add Binder and official Binders. All 134
  PNGs match the prepared source bytes; local importer is idempotent. The 11
  unresolved entries are 30thC, CBB6C, 30thP, CSOLC, Gym Event Promo Pack volumes
  1–6, and Scarlet & Violet Energies. The four source placeholders 30thD, CSEC,
  SP and SMP still have no supplied image. The authoritative mapping/exception
  list is `assets/rev2/12-chinese-set-logos/manifest.json`. No language/name-only
  substitution or source image editing was performed.
- Japanese crop source/alpha/invariance and local component-layout evidence at
  PR #203 is reused. It is not installed-app verification. No global scaling
  change or external asset publication is required for these bundled PNGs.

### Exact delivery path and external gates

1. Release owner: review the combined source and fresh CI; reconcile current
   repository/environment controls without bypassing them. Historical PR #191
   is already merged; this continuation is the next review of the same branch.
2. Database owner: target-schema/ledger review and authorized application of only
   `20260919100104_catalogue_pricing_cycles.sql`; verify table RLS, explicit
   service-role grants, revoked public function access and alias-trigger grants.
   Six recovered historical retrieval migrations are not instructions to replay
   them. Current Supabase [API security guidance](https://supabase.com/docs/guides/api/securing-your-api)
   was checked; local fixture success cannot establish the target grants.
3. Release owner: capture current rollback identities, deploy the reviewed API
   including exact-original selection and prepared valuation routes, then the
   gateway and compatible existing workers. Keep catalogue/prioritization flags
   disabled; enable only the separately approved stored-valuation lane after its
   authenticated canary passes. No artwork upload or catalogue write is needed
   for the bundled logo/resolver change.
4. Release owner: deliver the compatible **standard production** runtime/channel
   through the existing production test lane; an owner-recognition build does
   not verify the ordinary scanner. Confirm the installed standard native
   runtime before choosing OTA versus native. If native is needed for the test
   audience, select the exact reviewed source and production profile in existing
   EAS, then separately submit/distribute that build through existing TestFlight.
   Source distribution for phone tests must not wait for evidence that requires
   that distribution. No native dependency was added by this candidate.
5. Pricing/provider owner: the 12-hour full-catalogue objective stays externally
   BLOCKED. The existing evidence estimates 52,773 eligible requests and a
   14.66-hour lower bound at one request/second, before retry overhead. Supply a
   permitted capacity/bulk/delta plan that fits 12 hours before enabling the
   guarded full sweep, changing schedules or suppressing competing schedulers.
6. Device tester and catalogue owner: close the exact phone and asset/edition
   gates above. Until then the repair release is not VERIFIED IN CANDIDATE or
   RELEASED AND VERIFIED.

The remaining speed/UI/Settings increment stays separate. Holographic viewer
PR #209 is excluded until the baseline is stable. Tooling work is DEFERRED: no
new plugin or service is needed for this repair.

## Historical continuation — 12 September 2026

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
