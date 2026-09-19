# Chinese logo pack — integration receipt and remaining transfer

## Integration completed locally — 19 September 2026

The prepared pack was found in `D:/Stackr-1/assets/rev2/12-chinese-set-logos`
and integrated into the existing release candidate at
`2e3a3de4c6c44c475f7c40e23f1df6760bd2a42d`. All 134 original PNGs and their
mapping manifest are committed locally; 123 exact Simplified Chinese UUIDs
resolve through `lib/localSetArtwork.ts` in Discover Sets, Add Binder and
official Binders. The 11 unresolved mappings and four missing-source
placeholders below remain explicit. The original pack was not altered.

Post-import hash/dimension/identity tests, idempotence, existing published-logo
and language tests, app typecheck and lint passed (12 existing warnings, no
errors). Follow the [current integrated repair tracker](integrated-candidate-repair-20260912.md)
for bundle, CI, delivery and device states. The text below records the earlier
preparation-only handoff; its file-transfer blocker is now resolved.

## Historical preparation — 17 September 2026

## Status

The owner has authorised adding the already supplied PNGs to Discover Sets and delivering through the existing release process. No further image preparation or new sourcing is requested.

This branch contains a guarded importer, a read-only production identity snapshot and a post-import regression. **The 134 PNG binaries, generated runtime module and Discover Sets modification are not yet committed to GitHub. This preparation-only state must not be merged as a delivered app fix.** No mobile update, native build, database write, backend deployment or provider change has been performed.

Branch: `agent/catalogue/chinese-logo-pack-20260917`.
Base: `989da7d489d4e127ac80a8798a1bf67367942954`.
Keep subsequent import, validation and release coordination on this workstream. Preserve unrelated Japanese recrop work, shared artwork lookups and the user's desktop changes.

## Supplied assets and identity evidence

The owner-supplied `Stackr_Chinese_Logos_Individual.zip` contains 134 original screenshot cutouts. All manifest records are Simplified Chinese (`zh-cn`). The AI-redrawn sticker sheets are not used. All PNGs retain their original bytes and resolution. This is not a claim that the screenshots are high-resolution upstream source artwork.

Production project: `oakdbbzdqwurpjnoqhmu`; observed `2026-09-17T17:25:02.048386Z`.
Published catalogue: `zh-cn:api-launch-2026-08-09-v1` (`79f43e8f-7062-4d29-8571-569eccb7c249`). The snapshot contains 136 non-deprecated, uncorrected set identities, all also present in `api.catalogue_sets`. The code/UUID transcript was checked against a database-generated MD5 (`73d4db995ee01656624baeeb5a505ce9`). All queries were read-only.

123 supplied logos have exact case-insensitive printed-code matches within that language; their canonical UUIDs are retained. 11 assets remain unassigned: 30thC, CBB6C, 30thP, CSOLC, six Gym Event Promo Pack volumes and Scarlet & Violet Energies. Potential 30thP/promo-30th-p and CSOLC/cs0lc aliases are recorded, not silently accepted. Four screenshot placeholders (30thD, CSEC, SP, SMP) provided no logo.

Original ZIP SHA-256: `5c8c98fad4ceb00cd0abd4cb7594077d4ef39c8577444476df6004b8a1f8a169`.
Original manifest SHA-256: `bf084a1c9ee2677a135bea7c518509e02dea5b7691f6e90696769d71e2667f82`.

## What the importer applies

It copies the exact 134 PNGs into `assets/rev2/12-chinese-set-logos/logos`, writes a provenance/mapping manifest, generates 123 literal Metro asset requires in `lib/simplifiedChineseSetLogos.ts`, and makes a narrow Discover Sets fallback/code-label patch in `app/(tabs)/explore.tsx`. Existing local artwork has precedence; unresolved sets keep existing fallbacks. Names and printed codes remain live text. Transparent backgrounds, current dimensions and `contain` scaling remain unchanged.

The new resolver requires an exact canonical UUID and explicit Simplified Chinese language. It rejects conflicting identities/codes, foreign languages, code-only guesses and names-only matches. No direct client Supabase/provider call is added. `lib/localSetArtwork.ts` and other languages remain unchanged.

Dry-run is the default. Apply refuses main/master/detached HEAD, dirty target paths, a different manifest, altered PNGs, changed patch anchors and conflicting existing generated files. Repeated identical imports are no-ops. Failed writes are rolled back. The tool does not push or deploy.

## Validation actually completed

An isolated temporary Git worktree fixture exercised 3,007 assertions, including original PNG hashes/dimensions, every mapped identity, wrong-language/conflicting-ID rejection, dry-run/idempotence, dirty-path/main-branch refusal and the bounded TSX patch. The portable post-import regression also executed on that fixture. Independent Pillow checks decoded all 134 original PNGs and confirmed all hashes and transparent outer borders; zero pixels were changed.

This was not a full application checkout. Full app typecheck, existing complete regressions, Metro/native export, GitHub CI and installed-device rendering have not been established by those fixture checks.

## Minimum remaining action — file-capable local integrator

Use the existing approved desktop checkout or a coordinated isolated worktree on this same branch. The chat download `Stackr_Chinese_Logo_Integration.zip` contains `source-pack` (original manifest and 134 original PNGs), the same importer/snapshot/tests, prepared runtime files and validation receipts. The original uploaded archive can also be used after extracting its `Stackr_Chinese_Logos_Individual` directory. There is no need to source or redraw the images again.

From the repository root, with the path adjusted to the extracted source pack:

```powershell
node scripts/integrate-chinese-logo-pack.mjs --source 'D:\path\to\source-pack'
node scripts/integrate-chinese-logo-pack.mjs --source 'D:\path\to\source-pack' --apply
node scripts/test-simplified-chinese-set-logo-pack.mjs
```

Stop on any error and preserve local work; do not use reset/force options. Review the generated diff and run the repository's existing relevant typecheck, language/logo regressions and mobile asset-bundling checks. Commit and push only the 134 PNGs, asset manifest, generated resolver and Discover Sets change to this branch. Verify the remote binaries and static requires before marking the PR ready. Reconcile any intervening main changes rather than merging an old branch wholesale.

Then the release owner uses the existing compatible owner mobile delivery lane with exact source/runtime/channel evidence. Do not deploy the backend or database for this presentation-only change. Do not dispatch the frozen-source iOS workflow unchanged and assume it builds current main. Record CI/build/update identities and verify representative Chinese logos, names and codes in Discover Sets on the intended installed build, plus retained English/Japanese/Traditional Chinese behaviour.

The current chat connection can commit text but does not expose a bulk local-file-to-GitHub transfer action for these attached PNGs, and its local execution environment has no authenticated Git push. That transfer is the immediate blocker; app release and device checks remain subsequent outstanding work, not activities silently running in the background.
