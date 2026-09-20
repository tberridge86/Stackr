# Visible repair reconciliation — 20 September 2026

Status: **The requested feature release is incomplete. Build 45 is available in
TestFlight; the owner has authorized progressing the remaining steps and pushing
the prepared normal 1.0.4 candidate while away.**
The user reports absent shimmer, dead pricing, missing Settings/privacy work and
unchanged binder image speed. Installed build/update identity still needs device
confirmation; the source and live dependency omissions below are independently
verified and do not depend on that answer. Do not close these reports as green CI.

## Shipped versus requested

| Requested result | Build 45 / live state | Required completion |
| --- | --- | --- |
| Haptic holo tilt | PR #209 was omitted. The older gradient/tilt component is not the new inspection viewer. | Native viewer, intended real-card finish coverage and actual phone motion/haptic acceptance. |
| Missing artwork | Client fallbacks and mapped assets included, not all missing catalogue faces. Canonical UUIDs incorrectly skipped the optional edition-image resolver. | Client correction, compatible live resolver/data, actual decoded EN/JA/ZH binder images and documented remaining source gaps. |
| Home collection totals and Market prices | Pricing database/API/gateway and preparing worker are deployed. Prepared app reads remain off after a real 103/366-unit coverage result. | Reconcile saved/catalogue identity conflicts and stored quote coverage before replacing existing Home totals; verify signed-in Home/Binder/Market. |
| Faster retrieval / binder images | Older facts-first/cache paths included. The unified retrieval task did not deliver a completed implementation; no accepted device timings. | Actual visible-image and useful-content cold/warm/reopen measurements, then fixes to measured bottlenecks. |
| Settings, Help, Privacy | Settings still lists unavailable controls. Profile Help and Privacy lead to Settings; the requested separate destinations and broader functions were not implemented. | Working controls, verified permissions/data actions and separate Help/public legal content; no dummy toggles or invented legal/support facts. |

Current known artwork exceptions remain 245 confirmed face gaps, 58 additional
Base Set placeholders avoiding unverified edition aliases, 11 unmapped Chinese
logos and four missing-image source entries. These are the preceding bounded audit
results, not a fresh claim of complete live catalogue coverage.

## Production evidence — updated 20 September

The earlier missing-dependency observations were resolved in the authorized
pricing-first execution. [The pricing receipt](catalogue-pricing-20260919.md)
records exact protected workflow runs, source, backups and rollback identities.

- Migration `20260919100104` was rehearsed with rollback, then applied after
  physical/logical backup verification. Private table/RPC checks passed.
- API `5b3692aa-72e4-4c29-bec9-a11b4bb7bf89` and gateway version
  `93fab4d5-e687-4dee-8d37-e5b4faae9e40` deliver source `ff01a46b48a461d81a7d6af2510ddc7adcc35a48`.
  Health/source/privacy checks passed. Anonymous 401 is not owner price acceptance.
- Both existing pricing workers successfully deployed lookup fix
  `d2679d2110aa8e0166b1a93302639f2e5c5e8e7e`. Queue deployment
  `bfbbbe7b-0f2e-4b21-a7c3-ac264744c328` has stored preparation enabled;
  catalogue sweep, capacity and prepared refresh queue remain disabled.
- First real stored-only generation: 366 units, 103 priced (all older),
  £8.11 known subtotal, 194 unresolved, 66 pending, three unsupported.
  No new provider identities were selected/refreshed by that generation.
- Prepared API reads remain OFF. Missing mappings and conflicting saved finishes
  are not permission blockers and must not be guessed to inflate coverage.
  Existing Home fallback remains available. Signed-in/device acceptance is open.

## Local corrective candidate

Base: `0ea201d224e3bed0a09c8fc662645b97952078b7`, branch
`agent/release/complete-visible-repairs-20260920`, isolated checkout
`C:\Users\berri\.codex\worktrees\stackr-normal-build42\Stackr-1`.
The original dirty checkout and release owner's integration checkout were preserved.
Original corrective implementation: `8fa5034c994ad5a661c85927b2f90e50bffa5f4c`.
It now incorporates deployed main `d2679d2110aa8e0166b1a93302639f2e5c5e8e7e`
and Home coverage repair `6f494b4`; the final frozen source is attested by the
existing build workflow receipt before native submission.
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
- Home compares a partial prepared response against exact saved evidence mapped
  onto the currently owned identities and quantities. If the response prices
  fewer units, it uses the existing stored-price read path instead of replacing
  the known subtotal with that partial result. This path revalidates identities
  and updates binder values, trend and cache; it does not copy an old aggregate.
  Genuine decreases and authoritative per-identity invalidations remain valid.
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
  leaving Help cancels a delayed composer open after draft persistence.
  Diagnostics are reviewed and opt-in. Email opening is not ticket delivery.
- Legal links the existing public privacy page. Editable Markdown and matching
  accessible HTML drafts are prepared in `docs/privacy/`; they are explicitly
  unpublished and contain unresolved operator/legal/retention/provider facts.
  The operator confirmed **STACKRTCG LIMITED**, company number **17386590**, and
  **berridge14@icloud.com** on 20 September; the support composer and draft use
  that contact. The [Companies House record](https://find-and-update.company-information.service.gov.uk/company/17386590)
  independently confirms the entity and registered office at **18 Lyndhurst Grove,
  Chaddesden, Derby, England, DE21 6RY**. The draft includes this address.
  [Support-site PR #1](https://github.com/tberridge86/stackr-support/pull/1) was
  merged as `7599af71aa4589b60a2a9f38b265452f9cf647bc`: the public site now names
  the supplied company/number and uses the supplied contact for support/privacy
  requests. GitHub Pages completed and both live pages independently returned
  HTTP 200 with the corrected fields. Remaining policy text was preserved; this
  factual correction does not prove request handling or complete the draft notice.
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
| Settings/Help/export/Minty | PASS: executed persistence, failed-save recovery, provider-aware reset visibility, account-change sign-out guard, other-session scope, draft isolation/failure/unmount cancellation, optional diagnostics, bounded export/cancellation and Minty account/read/write tests. |
| Card inspection/haptics | PASS: 31 motion cases, 7 material cases plus 27 identity/mask assertions, 20 mocked lifecycle cases and 25 real Skia CPU/WASM cases; haptic dispatch/preferences and entry interactions pass. Native GPU and felt haptics remain NOT RUN. |
| Home, pricing UI and commerce restrictions | PASS: `test:home-release`, `test:collection-pricing-ui`, `test:commerce-release-lock`, `test:premium-seller-access`. No production quote is established by these checks. |
| Binder/artwork | PASS: supplied-image lookup avoidance, edition selection, binder presentation/interactions and 18 file-backed SQLite reopen cases; shared image recovery/candidate checks. Physical cold/warm/reopen timings remain NOT RUN. |
| Pricing preparation | PASS: exact source/checksum and migration scope, prior ledger requirements, private table/RPC contracts, checks-before-commit and rollback-on-failure. Uses mocked database boundaries; no actual target migration rehearsal/apply was performed. The Bash failure-propagation branch passed on Linux in Platform CI run `35497415040` (job `106042887183`) before that job's later unrelated test-harness failure. |
| Gateway | PASS: 44 existing tests after locked gateway install; no gateway source change or deployment. |
| Browser UI | PASS at 390×844: signed-out Settings/Help/Legal routes, saved haptic/motion controls after reload, Help search/expanded article and corrected navigation selection. These are browser checks, not phone acceptance. |
| Source hygiene/runtime | PASS: diff whitespace check and existing mobile runtime configuration; candidate is 1.0.4. |
| Remote CI | Initial run on `841b3d5` exposed a missing haptic-hydration mock in the existing RootLayout test harness; run on `5535446` then exposed stale preview version assertions. Both are fixed without dropping runtime-isolation assertions. `test:ux-service-release`, `test:iphone-preview` and the related owner-submission dry-run test pass locally. Follow PR #210 for subsequent exact-source CI results. |
| New native build and device journeys | NOT RUN. Build 45's earlier CI/delivery applies only to its recorded source. |

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
2. **Pricing/release operator — database and service delivery VERIFIED:** rehearsal,
   backups, scoped migration, private contracts, API/gateway delivery and a real
   stored worker publication passed. See the receipt above; do not reapply the
   migration or ask for the already-given execution authority.
3. **Pricing/release operator — OPEN coverage and app acceptance:** finish only
   evidence-backed saved/catalogue identity repairs and validate quote coverage.
   Keep prepared app reads off until quantities/value reconcile; retain existing
   fallback and known prices. Catalogue-wide provider capacity and twelve-hour
   throughput remain unverified and the sweep stays disabled. Prove authenticated
   exact-identity/source-labelled Home/Binder/Market readback after activation.
4. **Product/operator — external BLOCKED on facts and service decisions:** confirm
   applicable jurisdiction, representative/DPO position and response procedures
   for the designated support/privacy email;
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

The owner explicitly authorized progression and the next normal TestFlight version.
The database/API/gateway/worker deliveries above are complete. The new native
1.0.4 build is being prepared; public App Store release and physical acceptance
are separate and are not claimed. No saved holding or catalogue identity was
rewritten to bypass the unresolved price matches.
