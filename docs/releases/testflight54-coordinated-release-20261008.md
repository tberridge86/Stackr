# Stackr 1.0.6 (54) coordinated release

Owner-authorised on 8 October 2026: push the coordinated next release and deliver build 54 to the existing TestFlight app. Verified native, service and Apple identities are recorded in the [delivery receipt](testflight54-delivery-20261008.md).

## Source and audience

The candidate starts from main `77e2e8de67e9a39eb6bd79f4e56ce1d557c17cba`, which includes the delivered build 53 source `e9cb563446c632d53f317cf1fc48f28b85a3167f` and later accepted changes. The old dirty desktop checkout is preserved. Its older configuration, unrelated UI experiments and research artwork are excluded.

The normal app remains `com.tommo86.Stackr`, Apple app `6772118450`, EAS project `22048198-a309-41d2-a2bf-aa354c76be3a`, production data and `https://api.stackrtcg.com`. Before this release, build 53 was Apple `VALID` and available to existing internal/external testers, with remote iOS counter 53. The delivered native build is now 54 from reviewed source `bf3d7a233aa7d30dda99b61ccd51533ae85eed90`; Apple processing is `VALID`, with tester availability recorded in the delivery receipt. Version/runtime 1.0.6 isolates this native candidate from earlier 1.0.5 updates. The normal production submit profile now explicitly identifies the existing Apple app and internal `Team (Expo)` group.

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

## Verified production services

PR [319](https://github.com/tberridge86/Stackr/pull/319) merged as `92e444124a2cedc9647444a2656ff5d8f9343ce8`. Both its PR checks and exact-main Platform CI [37819963096](https://github.com/tberridge86/Stackr/actions/runs/37819963096) passed, including the patched zero-critical dependency gate.

The backend-only production run [37820015514](https://github.com/tberridge86/Stackr/actions/runs/37820015514) passed. Railway deployment `b594fd37-3c01-4642-a516-cf5c038d8442` is healthy and attests that source. The previous healthy deployment `e985732a-4ebe-4281-8811-963a61276a58` is retained. The unrelated provider-key patch `8e29d75c-d567-4a9a-9e96-8a40e51a22f3` remains staged and unchanged.

Gateway run [37821003494](https://github.com/tberridge86/Stackr/actions/runs/37821003494) passed. Production Worker version `072eeb72-fb64-422c-a0ba-e97f54dbbf95` serves 100% in deployment `156a0dfa-d273-4a8e-a81b-87e95097d06e`; existing secrets and Durable Object namespace were attested before and after. Public reads confirm Pikachu/Mr. Mime cards, pagination, bounded printing artwork, correct canonical variant-only asset associations, validation errors and request IDs. Anonymous price/history/refresh routes remain private. These checks do not establish signed-in owner price coverage.

A final image review found that Pokédex visible-card hydration still entered the old serial per-set enrichment path. The mobile follow-up replaces those whole-set/metadata reads with bounded printing-ID artwork batches while retaining the existing exact-card conversion and image guards. It does not change the deployed backend or gateway code.

Observed first-source-page retrieval can still take approximately 2.5 seconds; cached sampled reads were approximately 100–370 ms. No universal instantaneous-loading claim is made.

The native workflow's GitHub environment had no `EXPO_TOKEN`; the existing authenticated EAS CLI built and submitted the clean frozen reviewed revision with normal-production identity and runtime checks. Build 54 finished, its packaged identity/startup artwork were verified, the exact build was uploaded, and Apple processing is `VALID`. See the [delivery receipt](testflight54-delivery-20261008.md) for exact EAS/Apple IDs and independently verified internal/external availability. Installed-device acceptance remains pending.

## Owner feedback and content audit, 9 October

Apple's tester information now records the owner's iOS device as installed on `1.0.6 (54)`. This confirms delivery, not product acceptance. The owner reports unchanged loading, haptics, pricing and CoroCoro behaviour.

The source audit confirms a release-assembly omission: the newer premium startup video, card-to-sleeve-to-top-loader indicator and clickable CoroCoro library remained in the original desktop checkout and were excluded from the frozen build. The shipped loader was a plain native ring. The magazine cover pack was already present in the repository, but the new issue navigation and its native cover resolver were absent. Calling those changes unrelated UI experiments did not match the owner's requested scope.

Build 54's pricing change is a local provisional browse fallback plus stored quote reads, not a provider refresh or complete catalogue pricing operation. Its performance changes principally target species-card retrieval; they do not establish instant startup, general search or all-screen loading.

The recovery branch restores the requested opening and in-page animation, wires 52 existing loading callsites, adds the documented CoroCoro issue library with 26 bundled owner-supplied covers, limits initial set quote reads to the current incremental grid and one nearby page, and preserves already-read prices within the current card list and account. It also adds the existing preference-aware touch-feedback test to Settings and fixes the detail-card surface ignoring the saved Reduce card motion setting. Automated checks and an exported iOS bundle are review evidence; no replacement native build or upload is recorded here.

The same recovery removes two additional cold-path blockers: the main Pokédex publishes its initial 151 entries before continuing, without caching an incomplete list, and set search ranks facts without first enumerating global artwork manifests. See the [mobile recovery record](mobile-release-recovery-20261009.md) for the exact candidate scope, runtime fixtures, packaging checks and remaining gaps.

Remaining work must stay explicit: calibrated all-catalogue prices and provider coverage, broader measured cold/warm performance, eight missing magazine covers, unresolved exact card mappings and artwork within the magazine archive, and physical iPhone haptic/visual acceptance. The archive contains 34 documented issues and 54 card references; only the two previously curated Mew editions have exact Stackr card mappings. These remaining references must not be presented as fully connected cards.
