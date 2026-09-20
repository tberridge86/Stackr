# Visible repair reconciliation — 20 September 2026

Status: **The requested feature release is incomplete. Build 45 is available in
TestFlight, but availability did not deliver the agreed combined user experience.**
The user reports absent shimmer, dead pricing, missing Settings/privacy work and
unchanged binder image speed. Installed build/update identity still needs device
confirmation; the source and live dependency omissions below are independently
verified and do not depend on that answer. Do not close these reports as green CI.

## Shipped versus requested

| Requested result | Build 45 / live state | Required completion |
| --- | --- | --- |
| Haptic holo tilt | PR #209 was omitted. The older gradient/tilt component is not the new inspection viewer. | Native viewer, intended real-card finish coverage and actual phone motion/haptic acceptance. |
| Missing artwork | Client fallbacks and mapped assets included, not all missing catalogue faces. Canonical UUIDs incorrectly skipped the optional edition-image resolver. | Client correction, compatible live resolver/data, actual decoded EN/JA/ZH binder images and documented remaining source gaps. |
| Home collection totals and Market prices | Pricing client included, new prepared-valuation server/database/gateway dependencies absent. No new Market repair beyond the existing candidate. | Complete the coordinated stored-valuation rollout; trace exact owned identities and source-labelled prices through Home/Binder/Market. |
| Faster retrieval / binder images | Older facts-first/cache paths included. The unified retrieval task did not deliver a completed implementation; no accepted device timings. | Actual visible-image and useful-content cold/warm/reopen measurements, then fixes to measured bottlenecks. |
| Settings, Help, Privacy | Settings still lists unavailable controls. Profile Help and Privacy lead to Settings; the requested separate destinations and broader functions were not implemented. | Working controls, verified permissions/data actions and separate Help/public legal content; no dummy toggles or invented legal/support facts. |

Current known artwork exceptions remain 245 confirmed face gaps, 58 additional
Base Set placeholders avoiding unverified edition aliases, 11 unmapped Chinese
logos and four missing-image source entries. These are the preceding bounded audit
results, not a fresh claim of complete live catalogue coverage.

## Read-only production evidence

Observed 20 September at approximately 06:55–06:56 UTC:

- Direct Railway `/health`: HTTP 200, `gitCommit=92ba011b1442`, source
  `bundled_workflow_sha`, deployment `10613eca-a888-4ef0-af96-8dc1cc7d7d20`,
  environment `production`, Supabase `oakdbbzdqwurpjnoqhmu`. Repository resolution:
  `92ba011b1442d5afa0c2bcb1b1189b61988a5ba0`.
- Railway confirms that deployment is the API's latest, successful since
  13 September. Config inspection exposed names only; no secret values were read
  into the report. `STACKR_PREPARED_VALUATIONS_ENABLED` was not among service names.
- Public `https://api.stackrtcg.com/v1/market/collection-valuation`: HTTP 404,
  `route_not_found`. Public `/v1/health` returns 200. Direct origin route access
  correctly refuses requests without gateway authentication (401); that 401 alone
  does not establish whether a route exists.
- Single read-only production query: migration `20260919100104` is absent;
  `public.catalogue_price_cycles` and
  `public.collection_valuation_generations` both resolve to NULL.

These demonstrate a missing prepared-valuation delivery chain. They do not prove
the cause of every legacy/card-specific price failure or establish fresh price
coverage. No authenticated user-price trace or provider refresh was performed.

## Local corrective candidate

Base: `0ea201d224e3bed0a09c8fc662645b97952078b7`, branch
`agent/release/complete-visible-repairs-20260920`, isolated checkout
`C:\Users\berri\.codex\worktrees\stackr-normal-build42\Stackr-1`.
The original dirty checkout and release owner's integration checkout were preserved.
Final implementation source: `d647ef1811bdfefd0b0499a30af2a633c3383733`.
PR #210 was independently confirmed open/draft at the base above before this
update. This corrective source is committed for integration into that same PR;
it has not been merged or delivered to a phone. Build 45 remains the last
verified distributed normal build, as recorded in
[its delivery receipt](normal-testflight-45-handoff-20260919.md).

- Integrated the reviewed PR #209 implementation
  `c0b6d37f0e1c17424a74e937969f704a72c7dd49` into the combined repair source.
  Preserved both pricing and inspection scripts in the package conflict; reviewed
  Home/Binder/card integrations for existing price, ownership and artwork behavior.
- Exact canonical UUIDs can request edition artwork through the existing backend
  database resolver. UUID-shaped values cannot become fabricated provider image
  URLs. Existing supplied Unlimited/raw exact art retains precedence. Optional
  lookups abort after 4.5 seconds or unmount; no binder-speed claim follows from this.
- Binder grid/showcase images with supplied artwork now skip optional edition
  lookups entirely. Inspection retains exact lookup when needed. This removes a
  proven request amplification problem without asserting measured phone speed.
- Replaced the Settings placeholder panels with compact working controls:
  provider-aware password recovery; account-checked local/other-session sign-out;
  persisted global touch feedback; saved card-motion reduction combined with OS
  Reduce Motion; real camera/photo/notification status and device-settings links;
  and replaceable Expo image-cache clearing. Five legacy haptic callers now obey
  the same saved preference. Failed preference reads suppress effects; failed
  writes keep the previous choice. Cache clearing does not clear app storage.
- Saved-collection export checks the account before and after bounded paginated
  reads, includes exact saved variant/quantity/language/condition/grade/slot data,
  cancels on account change, and shares nothing after partial failure or deadline.
  It omits enrichment and is not a complete personal-data export. Binder export
  order is deterministic creation/id order; card slot order is retained.
- Minty preferences use the existing per-account keys and defaults, persist before
  taking effect, and are shared between Home and Settings. Unknown/read-failed
  preferences suppress personalised insights. The old cross-account key is removed
  best-effort and never read. Home's local insight respects the saved choices.
- Added separate searchable Help, Legal and About routes, including signed-out
  access from Login. Six articles describe current product flows. Card inspection
  supplies whitelisted exact identity context for a report. Device-local drafts
  are account/context-scoped, survive composer failure and are never marked sent;
  diagnostics are reviewed and opt-in. Email opening is not ticket delivery.
- Legal links the existing public privacy page. Editable Markdown and matching
  accessible HTML drafts are prepared in `docs/privacy/`; they are explicitly
  unpublished and contain unresolved operator/legal/retention/provider facts.
  Neither these drafts nor the deletion-request link establish compliant account
  deletion, private support receipt, a monitored inbox or an approved notice.
- Fixed Settings falsely selecting the Collection tab. About shows build/update
  identity and uses the existing compatible-update path without claiming that an
  OTA check establishes the latest native version. Native update checks are hidden
  on web because the installed web shim always returns a non-update result.
- App/package version is prepared as `1.0.4`, preserving the existing appVersion
  runtime policy and audience flags. The Skia-dependent candidate cannot be sent
  to build 45's `1.0.3` runtime. No remote build number has been allocated here.

### Acceptance evidence

| Check | Status and scope |
| --- | --- |
| App typecheck and lint | PASS on final implementation source; 0 errors, 12 existing lint warnings. |
| Settings/Help/export/Minty | PASS: executed persistence, failed-save recovery, provider-aware reset visibility, account-change sign-out guard, other-session scope, draft isolation/failure, optional diagnostics, bounded export/cancellation and Minty account/read/write tests. |
| Card inspection/haptics | PASS: 31 motion cases, 7 material cases plus 27 identity/mask assertions, 20 mocked lifecycle cases and 25 real Skia CPU/WASM cases; haptic dispatch/preferences and entry interactions pass. Native GPU and felt haptics remain NOT RUN. |
| Home, pricing UI and commerce restrictions | PASS: `test:home-release`, `test:collection-pricing-ui`, `test:commerce-release-lock`, `test:premium-seller-access`. No production quote is established by these checks. |
| Binder/artwork | PASS: supplied-image lookup avoidance, edition selection, binder presentation/interactions and 18 file-backed SQLite reopen cases; shared image recovery/candidate checks. Physical cold/warm/reopen timings remain NOT RUN. |
| Pricing preparation | PASS: exact source/checksum and migration scope, prior ledger requirements, private table/RPC contracts, checks-before-commit and rollback-on-failure. Uses mocked database boundaries; no actual migration rehearsal/apply was performed. The Bash pipeline execution branch is platform-skipped on Windows and requires Linux CI. |
| Gateway | PASS: 44 existing tests after locked gateway install; no gateway source change or deployment. |
| Browser UI | PASS at 390×844: signed-out Settings/Help/Legal routes, saved haptic/motion controls after reload, Help search/expanded article and corrected navigation selection. These are browser checks, not phone acceptance. |
| Source hygiene/runtime | PASS: diff whitespace check and existing mobile runtime configuration; candidate is 1.0.4. |
| New exact-source remote CI, native build and device journeys | NOT RUN at receipt preparation. Follow PR #210's check results for subsequent CI evidence. Build 45's earlier CI/delivery applies only to its recorded source. |

These checks establish local implementation evidence, not production acceptance.

PR #209 still has **zero verified real-card mask records**. Cosmos, reverse and
diagonal finishes remain neutral without masks; explicit textured/radiant finishes
have generic treatments. Do not claim the expected shimmer is complete just
because the viewer now compiles. Original procedural material tests do not prove
printing fidelity or actual device delivery.

## Remaining release work and dependency order

1. **Release owner — READY FOR VERIFICATION:** integrate this locally committed
   source through existing PR #210, run its exact-source CI and review the combined
   scope. Existing normal TestFlight authorization is retained; no repeat blanket
   upload approval is requested. Device distribution is a verification step and
   must not be made circularly dependent on prior device proof. The requested full
   release nevertheless remains open for the named gaps below.
2. **Pricing/release operator — external BLOCKED on scoped service/database
   authority and rehearsal evidence:** the existing production preparation workflow
   now has a `catalogue` scope, default read-only, main-only/protected-environment
   execution, separate `PREPARE CATALOGUE PRICING` confirmation and explicit apply.
   It requires verified current physical backup/logical dumps, two binder and six
   personal-pricing prerequisites, then only
   `20260919100104_catalogue_pricing_cycles.sql` (SHA-256
   `100847e33f08b9afafbe04bda2a262b369a6e8061ca8099d69ac435e15b8778e`).
   RLS, public denial, service-role function permissions and the exact ledger row
   must pass before commit. Rehearse and retain recovery evidence before approving
   the production apply. Merge/deploy/apply authority is not inferred from app
   distribution authority.
3. **Pricing/release operator — OPEN dependency rollout:** deploy compatible API,
   authenticated gateway routes and the existing bounded worker after the schema.
   Keep catalogue sweep/capacity/prepared-refresh-queue flags false; only then
   enable `STACKR_PREPARED_VALUATIONS_ENABLED` on API and worker. No provider refresh,
   scheduler change or catalogue sweep is included in this lane. Prove authenticated
   exact-identity/source-labelled stored prices and Home/Binder/Market readback.
   The existing snapshot endpoint returns 401 without authentication; personal
   pricing access policy is not weakened by this change. That response does not
   establish an owner quote failure. Market remains unverified, not repaired.
4. **Product/operator — external BLOCKED on facts and service decisions:** supply
   controller legal name/contact and confirm the monitored support/privacy channel;
   validate processor, lawful-basis, retention and age-policy facts in the prepared
   draft. Private request delivery with a real receipt and authenticated deletion
   with completion evidence remain OPEN implementation/service gates. The email
   composer and local draft do not satisfy them. Public notice publication requires
   approval after facts and actual behavior are reconciled.
5. **Asset owner — external BLOCKED on exact sources:** the frozen artwork/logo
   exceptions above and verified real-card foil masks remain missing. Do not invent
   card art or substitute generic full-card lighting for printing-specific foil.
   Current renderer integration is READY FOR DEVICE VERIFICATION, not finished
   common-finish coverage.
6. **Device tester/release owner — external BLOCKED on physical evidence:** use the
   identified new native runtime through the existing normal test route, then prove
   camera 10/10 capture-to-save/reopen, denial/recovery, background/resume, fresh
   launch, exact images, holo/haptics/accessibility, prices and measured binder
   cold/warm/reopen performance. Preserve recognition/private ownership/commerce
   gates. Owner camera, Expo Go, mocks and Apple approval cannot replace this.
7. **Release owner — OPEN final acceptance:** record monitoring and validated
   rollback artifacts after delivery. Pricing rollback disables prepared-summary/
   queue flags and retains additive history; API/gateway/client rollback artifacts
   must each be validated. Previously observed IDs are not rollback eligibility.

No server deployment, gateway promotion, database/catalogue mutation, price refresh,
staging/production job, native build/upload, OTA or public-store release occurred
in this review. Updating the existing draft PR runs its ordinary automated checks.
