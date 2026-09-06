# Binder image and catalogue recovery — 5 September 2026

Status: implementation and release candidate verification; **not a complete catalogue or a deployment claim**.

## Demonstrated failures and repairs

- The supplied VSTAR Universe screenshot shows Japanese `VSTARユニバース`, an S12a logo, 83 owned cards, an unknown total, and blank tiles. This is evidence from the user's existing binder, not an authenticated reproduction in the connected browser.
- The live TCGdex Japanese S12a response supplies image bases under `/ja/S/S12a/001`. Both Stackr guards previously required `/ja/cards/...`. Commit `969e60d` accepts the safe series namespace actually supplied by an exact provider record. Language, set/card/collector identity, source/provenance, HTTPS host, low rendition, runtime issuance, denylist, attribution, and removal controls remain enforced. A HEAD request to the exact issued Japanese S12a/001 low rendition returned HTTP 200 and `image/webp`; no image binary was downloaded or mirrored.
- Read-time binder set identity resolves canonical UUIDs case-insensitively and distinguishes Japanese and Traditional Chinese S12a using recorded language, exact identifiers, and native names. Ambiguous identities remain explicit; they do not default to English.
- Saved rows are matched through confirmed set aliases and unique card/collector identities. An unmatched or temporarily unavailable catalogue no longer removes saved cards from the returned view. Saved IDs, quantities, notes, and memberships are not rewritten. Ambiguous rows remain available for review rather than being silently merged.
- The binder uses resolved set totals, not the number of owned rows. Japanese regular-card mode and full/master mode retain distinct denominators. Missing nested images can fall back to the same saved card's usable image. Unissued historical provider pointers are retained in storage but are not treated as newly issued image references.
- Empty set/card results are not retained as populated catalogue cache entries. Explicit refresh clears binder/card/reference read caches. Incomplete catalogue matching has a visible retry message and cannot award a completion achievement.
- Shared English/Japanese/Simplified/Traditional selectors and flags remain in place. English uses the existing UK-front/US-behind component. Native names remain primary with English supplements; no replacement artwork was generated.

## Read-only evidence and coverage limits

Earlier public production reads on 5 September returned Japanese S12a (UUID `d6a23ad9-7d3d-482c-a477-304584a335e3`) with 258 card records and Traditional Chinese S12a (`eed3fcbd-fd4c-4b7f-9b75-a68e15d61476`) with 250. The Japanese provider declares 172 regular cards and 258 including extras. These are different release populations, not interchangeable editions.

Later bounded production probes at 19:23:55–19:24:04 UTC returned HTTP 504 for those named Japanese/Traditional Chinese endpoints and one Simplified Chinese endpoint. A sampled English endpoint returned HTTP 200 with zero records. A follow-up set-list sweep at 19:24:15–19:24:17 UTC returned HTTP 503 for all four requested languages. These observations do not establish that every set is empty. The full public catalogue scan was paused, and the release owner was notified.

The local hash-checked baseline uses the **14 August provider inventory** and **3 September canonical evidence**, not a current production snapshot:

| Language | Dated provider sets | Combined dated evidence sets | Full card denominator |
| --- | ---: | ---: | --- |
| English | 218 | 223 | Unknown for 5 sets |
| Japanese | 177 | 383 | Unknown for 206 sets |
| Simplified Chinese | 56 | 185 | Unknown for 129 sets |
| Traditional Chinese | 98 | 98 | 8,980 provider-declared cards |

Canonical evidence in this baseline contains variant identities, not a distinct-card population. Observed card counts and image-load completeness therefore remain **unknown**, including for Traditional Chinese. The dated reconciliation has one unmatched/unrepresented provider set, Simplified Chinese `csv1c` (nine provider-declared cards); this is an audit exception, not authority to insert a duplicate.

Tools added:

- `scripts/audit-four-language-catalogue-coverage.ts`: field-level coverage with explicit unknown populations and identity conflicts.
- `scripts/collect-four-language-coverage-baseline.ts`: hash-verifies the named dated evidence before comparing it.
- `scripts/collect-public-catalogue-coverage.ts`: read-only paginated current API inspection, bounded concurrency/retries, distinct-card counts, metadata gaps, and verifiable request evidence. Descriptor/pointer presence never becomes a successful image-load claim. Missing set-mark fields in the API remain unknown rather than being reported as missing assets.

## Verification and release gate

Passing checks include API HTTPS/UUID regressions, API v1 integration, gateway (24 tests), backend (24 tests), language flags, native-language display, foreign-card presentation, controlled reference images, binder image non-persistence, set-mark policy, CJK audit tests, collection pricing UI/API, seller routing/access, and new binder identity/presentation and coverage regressions. Standard lint reported no errors and ten existing app/component warnings; wider touched-file lint also reported existing warnings, not errors.

Final post-edit app typecheck and backend typecheck passed. The production-targeted web export passed with 92 routes. Local output: `D:/Stackr-1/.tmp/cjk-binder-build-20260905-production`. Entry bundle: `entry-7b18cced3ab8c99f82449cff5aba070f.js`, SHA-256 `59314c64a790ea27e961a2c59b20205f5f9a69d9a91e4670ed9f87ad51180480`. The exported configuration contains production app/environment values, and the bundle includes the new saved-card matcher and both refresh-cache functions. This is build verification, not an authenticated UI test or deployment.

The connected Codex browser remains at the login screen. The user is signed into a separate browser in the screenshot. Existing/new-binder visual verification, including actually seeing loaded native-language cards and checking owned quantities, remains outstanding. Do not report this as passed from API responses or source assertions.

## Remaining work

1. Restore reliable production set/card reads and run the current public coverage collection.
2. Verify the repaired build in an authenticated existing binder and representative new binders in all four languages.
3. Continue source-backed set/card/mark gap filling using the current per-set report. Confirm the dated `csv1c` exception before adding anything.
4. Expand the existing two metadata-only original CoroCoro entries and other magazine/event/regional promo coverage with exact source evidence. Their full image and historical-release coverage has not been verified by this repair.
5. Complete native image-delivery checks and independent release-population denominators. Do not infer universal coverage from the database or a single provider snapshot.

No production/staging catalogue, Supabase, storage, ownership, or price-refresh mutation was performed. Work remains under `docs/stackrtcg-ip-operating-boundary.md` and the existing recorded source reviews. No source permission was fabricated or broadened.

## Historical-data recovery continuation — evening of 5 September

The user asked for all historically acquired eligible card art, set names and
marks to reach binders. Read-only production diagnostics confirm that at least
some apparent image gaps are **delivery failures, not absent artwork**:

- Japanese S12a variants `00334020-2322-465c-ae1a-4dd60ec88197` (115) and
  `039c5a96-5071-4998-b7c1-53b0cc6454c2` (113) have retained
  `supabase_storage` card-image rows, with approved permission/rights, active
  retention and public-catalogue visibility. Asset row IDs are
  `a897daba-db22-4918-8c3e-407b05dc17f1` and
  `9db0314a-0912-44b6-b644-7bbcdfda37e4`. No artwork was copied, replaced or
  deleted. Row presence does not itself verify successful browser delivery.
- The existing `api.catalogue_cards` query for that Japanese set, ordered by
  variant UUID with a limit of six, exceeded an eight-second statement timeout.
  Its plan began with published-version membership and filtered the set late.
  Adding the exact currently published set version
  `d560cd01-de2a-4713-9518-b967fb4c5ac9` changed the plan to set/printing index
  lookups and completed the sampled query in 1,544 ms. The set-version lookup
  took 19 ms. The plan processed 347 variants for 258 printings; those units
  must not be confused with card totals or ownership quantities.
- A separate manifest query for six exact Japanese variants still exceeded
  five seconds. Its coalesced identity predicate also filters late. The
  set-card version fix is therefore **not a claim that the complete endpoint
  is now below the gateway timeout**. A non-lossy candidate-query design and
  the required equivalence checks are recorded in
  `docs/historical-asset-query-recovery.md`; it is not a deployed RPC/migration.
- A fresh public Simplified Chinese `CSV1C` lookup returned the existing set
  `31225f01-ead5-4e8d-83f8-c06978e706da`, native name `亘古开来`, total 167.
  The dated nine-card `csv1c` exception above must not be imported as a new set.

Historical approved display content was also checked against its existing
callers. The Japanese logo map already includes all 204 reviewed pack files;
the dated runtime audit resolves 177 of 394 set identities (142 direct,
10 aliases, 25 unique codes). One identity is ambiguous and 216 have no exact
pack match. The dated name audits cover 270/394 Japanese and 87/220 Chinese
set identities with English supplements. These figures describe those audit
populations, not today's total live sets, unique missing cards, or verified
image loads. No approximate logo/name matches were introduced.

The release coordinator subsequently reported that its owner paused the lane:
PR #134 must remain draft/reviewable; no merge or deployment authority was
provided. Authenticated existing-binder visual verification is still pending
at `http://127.0.0.1:8087/login`. The overnight continuation is attached to this
task, but neither a schedule nor passing source tests establishes completion.

### Verified continuation build

- `4aa2d40` is the separately reviewable backend set-version query repair.
- Historical binder branding now explicitly requests approved canonical set
  assets. Mandatory set facts finish inside the existing preferred-read budget
  before optional logo/symbol/cover/artwork reads begin. Those optional reads
  have independent two-second child deadlines; failed marks cannot discard a
  populated Chinese set list or erase a saved binder image URL.
- Already fetched cards and embedded images survive failed optional client
  manifest/set-detail enrichment. Missing totals, dates and series remain
  missing rather than being invented. Parent cancellation still propagates.
- A non-cooperative aborted preferred transport no longer blocks fallback
  forever. Its deadline remains a live timer in Node, so regression assertions
  now run to completion instead of falsely passing on early process exit.
- Final app and backend typechecks passed. Standard lint passed with ten
  existing warnings; touched-source lint passed with twelve existing warnings.
  API integration, gateway (24), backend (27), binder identity/presentation,
  optional enrichment/deadlines, actual-completion foreign picker regression,
  language flags/native-English presentation, controlled images/non-persistence,
  set marks, CJK audit/coverage, pricing and marketplace routing/access checks
  passed. No real authenticated binder result is asserted by these tests.
- The final production-configured web export passed with 92 routes:
  `D:/Stackr-1/.tmp/cjk-binder-build-20260905-historical-recovery`.
  Entry: `entry-ad05de483d209c3601e46e19194db01a.js`.
  SHA-256: `f432f384573ac0ad8030df09f18c8181458abced3c5f4dd64e32b3398db45103`.
  The isolated preview at port 8087 serves this build. This updates a local
  preview only; the backend query repair has not been deployed.

Independent review verified no stored catalogue/ownership mutation and kept the
remaining manifest performance and signed-in UI checks open. Optional set-mark
reads are bounded but currently global by asset type; narrowing them to exact
binder set IDs remains a follow-up, not a completeness claim.

### Asset-query proof and fresh regression pass — later continuation

The complete read-only asset candidate now has a retained SQL prototype and
self-contained PostgreSQL equivalence fixtures. It preserves direct and
inherited CVA/asset identities, exact coalesce precedence, same-artwork links
across published versions, duplicate elimination and all final manifest
eligibility rules. The fixture returned eight expected/eight actual complete
rows with no differences. Removing each of the four candidate branches made
the SQL fixture fail as intended; the offline test also catches omitted
printing-to-variant inheritance. These are non-vacuous fixture proofs, not
proof that all current production artwork is being served.

The complete six-Japanese-ID candidate still did not finish before its
five-second deadline. Its required asset-printing branch has no suitable
index; the isolated branch did not finish before two seconds. The asset heap
was 214 MB at this observation. An owner-authorized index rehearsal and actual
four-language/effective-DTO comparisons are still required. No index, function,
view, statistics, stored content or ownership record was changed. Full details
are in `docs/historical-asset-query-recovery.md`.

A fresh API run initially exposed a stale source assertion left behind by the
optional-enrichment refactor. The assertion was corrected to require a
mandatory parent-cancellable card read and a separately bounded set-detail
child signal. The full API test then passed. Fresh app/backend typechecks,
standard lint (zero errors, ten existing warnings), gateway 24/24, backend
27/27, binder identity/quantities/picker, native/English language presentation,
flags, controlled images, reference non-persistence, set-mark policy and
marketplace pricing/routing/access tests passed. New offline asset-query
regressions also passed.

Focused lint of the two edited test scripts passed with one existing
default-import naming warning. The API test now explicitly imports Node's
`Buffer` for its existing malformed-cursor test; runtime application code is
unchanged.

This continuation changes tests and review evidence only, not application
runtime code. The previously verified 92-route production-configured build
and its `entry-ad05de483d209c3601e46e19194db01a.js` entry remain the preview
artifact; a fresh HTTP check of port 8087 returned that entry and status 200.
No new build or signed-in binder verification is claimed. PR #134 remains
draft, and the owner-paused production release has not been resumed.

### Owner-resumed repair — 6 September

The owner's subsequent “unblock this” resumes this scoped repair and release.
The signed-in preview is accessible. The existing VSTAR Universe binder renders
native Japanese names, its saved logo, 75/172 tracked slots, 97 missing slots
and seven duplicates, but reports catalogue retry and no card images. No
ownership controls were operated. Those displayed quantities are observations,
not yet a verified reconciliation of all saved records.

Staging now has three additive identity indexes and a bounded, service-role-only
security-invoker RPC. It reads the unchanged approved asset manifest and changes
no catalogue, asset, storage or ownership rows. Complete DTO comparisons against
independently obtained original-query membership passed for English, Japanese,
Simplified Chinese and Traditional Chinese: 48, 50, 137 and four asset rows,
respectively; zero missing or extra rows in every sample. Seven invalid input
cases were rejected and cursor pagination reproduced the same full DTOs.
The 50-variant RPC samples completed in 171–772 ms on staging. These are samples,
not proof of complete card coverage or production latency. Detailed evidence is
in `deploy/evidence/binder-artwork-read-staging-2026-09-06.json`.

The backend RPC option is implemented and regression-tested but remains off
until the production dependency is prepared through a protected release path.
No production database or backend change has been made at this checkpoint.
The existing broad catalogue release would promote data, so it is not used for
this read-side repair. A narrowly bounded preparation workflow is being added.
