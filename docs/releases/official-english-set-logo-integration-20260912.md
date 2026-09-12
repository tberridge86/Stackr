# Official English set-logo integration — 12 September 2026

## Scope

Integrate the owner-reviewed canonical English set-logo cohort into Stackr's existing local set-artwork fallback without changing card art, product photography, seller media, catalogue membership, pricing, ownership or database records.

## Identity contract

- Fifteen unique reviewed image files are bundled.
- Existing Stackr identity `me5` remains canonical for Pitch Black.
- Provider/set-code `me05` resolves to the same file.
- `PBL` is rejected and is not represented in the manifest or runtime index.
- Shared McDonald's and POP Series artwork is stored once and mapped through aliases.
- `sve`, `xya`, `bog`, `sp` and `miscp` remain unresolved rather than receiving fabricated logos.

## Runtime integration

`getLocalSetArtworkSourceForSet` now resolves, in order:

1. exact magazine issue cover;
2. reviewed English set logo;
3. existing Japanese-only set-logo fallback.

The Japanese resolver now treats `bwp`, `dpp`, `smp`, `sp`, `svp` and `xyp` as language-ambiguous. They resolve Japanese marks only when the identity is explicitly Japanese, preventing English promo and Sample records from receiving Japanese artwork.

## Verification contract

- Exact binary SHA-256, normalized pixel SHA-256 and dimensions are pinned in `data/catalogue/official-english-set-logos.json`.
- The materializer refuses substitutions, duplicates, non-English entries, non-HTTPS sources, a second Pitch Black identity or `PBL`.
- Runtime tests prove all aliases, language gating, shared-asset deduplication, static bundling and collision behavior.

## Test receipts

### Guarded materialisation and source verification

- GitHub Actions run: `34702189958`
- Verified runtime commit: `4bc9ad1c6e01c4c7b35037121a6bf9e17a5216c1`
- Passed:
  - exact materialisation of all 15 reviewed binaries;
  - manifest and binary hash validation;
  - 47 alias and single Pitch Black identity assertions;
  - English/Japanese collision regression suite;
  - `tsc --noEmit`.

### Latest-main reconciliation

- GitHub Actions run: `34702307256`
- Reconciled branch head: `92104efd2a93d9ba94ec39aaeaf88b87dd76a1ab`
- Merged and tested against `main` at `4c0be1ae7ac77b46debd241cf106f4834fe5ffb5`.
- Repeated the official-logo tests, Japanese collision tests, full TypeScript checking and diff hygiene successfully.

## Delivery state

| State | Status | Evidence |
| --- | --- | --- |
| Implemented | yes | canonical resolver, manifest, materializer, 15 bundled assets and collision guard |
| Source tested | yes | GitHub Actions runs `34702189958` and `34702307256` |
| Merged | no | PR and release-owner merge still required |
| Deployed | no | no OTA/native/backend deployment in this catalogue change |
| Installed-device verified | no | requires the affected build/update on a phone |

## Rollback

Revert the integration merge. The existing remote/API artwork and Japanese fallback paths remain otherwise unchanged; no database rollback is required.
