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

- Integrated the reviewed PR #209 implementation
  `c0b6d37f0e1c17424a74e937969f704a72c7dd49` into the combined repair source.
  Preserved both pricing and inspection scripts in the package conflict; reviewed
  Home/Binder/card integrations for existing price, ownership and artwork behavior.
- Exact canonical UUIDs can request edition artwork through the existing backend
  database resolver. UUID-shaped values cannot become fabricated provider image
  URLs. Existing supplied Unlimited/raw exact art retains precedence. Optional
  lookups abort after 4.5 seconds or unmount; no binder-speed claim follows from this.
- Settings now persists device-local touch feedback. Native haptics await the saved
  preference; reopening retains changes and failed writes preserve previous state.
  This is one real Settings control, not completion of the full Settings brief.
- App/package version is prepared as `1.0.4`, preserving the existing appVersion
  runtime policy and audience flags. The Skia-dependent candidate cannot be sent
  to build 45's `1.0.3` runtime. No remote build number has been allocated here.

Local validation passes: app typecheck; lint (0 errors, 12 existing warnings);
card-inspection suite including real Skia CPU/WASM rendering and mocked lifecycle
tests; Home release; Binder retrieval including file-backed SQLite reopen;
edition-image selection; executed haptic preference persistence/reopen/failure
tests; mobile runtime configuration. These are local evidence, not native GPU,
physical-device timing, new CI, TestFlight delivery or production acceptance.

PR #209 still has **zero verified real-card mask records**. Cosmos, reverse and
diagonal finishes remain neutral without masks; explicit textured/radiant finishes
have generic treatments. Do not claim the expected shimmer is complete just
because the viewer now compiles. Original procedural material tests do not prove
printing fidelity or actual device delivery.

## Remaining release work and dependency order

1. Complete the visible scope above in this existing release workstream. Full
   Settings/Help/Privacy, broad retrieval acceptance and common holo coverage remain
   open. Preserve recognition, pricing provenance, private ownership and commerce
   restrictions. Do not replace missing data with fabricated values or effects.
2. Prepare the exact migration `20260919100104_catalogue_pricing_cycles.sql` and
   reviewed compatible API/gateway/existing-worker source for the stored-valuation
   lane described in `catalogue-pricing-20260919.md`. Reconcile the target schema,
   rehearse the migration and retain backup/rollback evidence before scoped release
   approval. Do not use a code-only backend deployment to imply these dependencies
   were applied.
3. For that initial lane retain catalogue sweep, capacity and prepared refresh queue
   flags false. Enable only prepared stored summaries after the schema, API, gateway
   and worker dependencies are present. Existing provider approvals/schedules remain
   unchanged; no catalogue-wide fetching is authorized by this reconciliation.
4. Prove authenticated exact-identity stored price readback and stable totals on the
   actual Home/Binder/Market flows before advertising pricing fixed. Rollback keeps
   additive history; disable prepared-summary/queue flags and restore separately
   validated API/gateway/client artifacts as needed. Observed IDs are not yet
   validated rollback eligibility.
5. Freeze the final complete source, run applicable exact-source CI/release gates,
   then use the existing normal iOS/TestFlight workflow with the new native runtime.
   No competing release workflow or branch promotion was started by this review.
6. Physical acceptance still requires standard camera 10/10 captures reaching the
   existing pipeline plus close/reopen, background/resume and fresh launch; real
   holo/haptics/accessibility; image rendering; price correctness; and measured
   binder cold/warm/reopen behavior. Owner camera, Expo Go, mocks and Apple approval
   are not substitutes. Record rollout monitoring and validated rollback identities.

No server deployment, gateway promotion, database/catalogue mutation, price refresh,
remote job, native build/upload, OTA or public-store release occurred in this review.
