# Stackr 1.0.6 (54) coordinated release

Owner-authorised on 8 October 2026: push the coordinated next release and deliver build 54 to the existing TestFlight app. This receipt starts with preparation; build, deployment and Apple identities will be recorded after verification.

## Source and audience

The candidate starts from main `77e2e8de67e9a39eb6bd79f4e56ce1d557c17cba`, which includes the delivered build 53 source `e9cb563446c632d53f317cf1fc48f28b85a3167f` and later accepted changes. The old dirty desktop checkout is preserved. Its older configuration, unrelated UI experiments and research artwork are excluded.

The normal app remains `com.tommo86.Stackr`, Apple app `6772118450`, EAS project `22048198-a309-41d2-a2bf-aa354c76be3a`, production data and `https://api.stackrtcg.com`. Build 53 is Apple `VALID` and available to existing internal/external testers; the observed remote iOS counter is 53. The intended next number is 54. Version/runtime 1.0.6 isolates this native candidate from earlier 1.0.5 updates. The normal production submit profile now explicitly identifies the existing Apple app and internal `Team (Expo)` group.

## Included fixes

- Published species-card route and bounded printing-ID artwork batches, preserving current pricing, asset identity RPCs and fast set reads. The species reader uses published API views through the existing server-side search reader.
- Pokédex factual results publish from an initial 24-name source page, with opaque 120-name continuation pages, canonical deduplication, honest partial failures and bounded thumbnail hydration. Known route names start loading without waiting for optional species metadata.
- Physical variants, owned binders and manual markers contribute to ownership. Manual-marker buttons cannot remove physical inventory or binder ownership. Reads are account-scoped and paged.
- Missing resolved raw-card browsing prices receive a penny-rounded, low-confidence `Estimated price (provisional baseline)`. Stored quotes retain precedence. This local rarity/era baseline makes no provider request or database write and invents no sale evidence or timestamps. Non-raw products remain excluded. Last-sold labels require the actual proven-last-sold API evidence.
- Visible images use thumbnails; detail views retain full pixels and can show their supplied same-card thumbnail during loading. Synthetic blur and default fades are removed, and prefetch deduplication is bounded to 256 URLs. Exact language/printing and authorised reference safeguards remain.
- OpenAPI and generated declarations include the species route and bounded artwork batches. The new regression scripts are wired into normal Platform CI.
- The root lockfile pins the compatible `shell-quote` 1.11.0 patch for [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv). Expo and React Native versions remain unchanged. The existing cold-retrieval fixture now checks bounded canonical Pokédex paging and early factual results instead of the replaced per-language search fanout.

## Validation and delivery order

Local checks pass: full TypeScript checking, backend TypeScript checking, lint (zero errors; eight existing warnings), 49 gateway tests, API integration, 42/42 OpenAPI route coverage, deployment tooling, image selection/recovery, native-language display, progressive Pokédex/ownership fixtures, and price fallback/bulk-cache fixtures. Price fixtures retrieve 201 cards in three bulk calls and zero per-card calls, preserving account and condition isolation. Both approved evidence records already have the restored byte hashes in this candidate.

The release order is reviewed source/CI, the existing backend-only production lane, the existing gateway lane with exact rollback/binding attestation, live read-only species/artwork/privacy checks, then the frozen normal-app iOS workflow and submission. The unrelated staged Railway provider-key change is preserved. No schema, catalogue, recognition/model activation, price refresh or replacement schedule is included.

## Remaining acceptance

Universal instantaneous loading, all-catalogue live estimate coverage and iPhone rendering/ownership journeys remain unmeasured. The provisional price model is uncalibrated and is not provider market evidence. Authorised HD originals and a current artwork inventory audit are still required for the reported image gaps.

A public production sample exposed a published Trainer card whose English name was `Pikachu`. The new species route excludes explicit Trainer/Energy card types while retaining source cursors, preventing that metadata error from appearing as a Pokémon card. Correction of the underlying published name remains a catalogue follow-up; no translation data was rewritten here.

Build, upload, Apple processing and tester availability are pending at this preparation stage. Successful service tests do not establish an installed device has received the new code.
