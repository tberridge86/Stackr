# Magazine covers as set-identification artwork

The owner supplied 81 PNGs and asked for them to serve as the corresponding
set/binder cover artwork (the visual normally occupied by a set logo), including
search and marketplace set identification. These are not new collectible
magazine records, card faces, sealed-product photographs or seller item photos.

## Pack and matching

- CoroCoro Comic: 69 monthly issues, April 1996 through December 2001.
- CoroCoro Ichiban: June 2021.
- Pokémon Fan Japan: issue 73 (2021).
- Pokémon Fan US: issues 01–10.

The exact 81 original files are retained in
`assets/Pokemon_Magazine_Cover_Art_PNGs`. The manifest binds paths, dimensions,
byte lengths and SHA-256 hashes; the pack totals 57,603,833 bytes. No image was
cropped, generated, compressed, renamed or fetched from a third-party website.
The source folder in the owner's main checkout remains untouched.

`magazineSetCovers.ts` matches publication and issue together, with language
conflicts and ambiguous matches rejected. Issue labels come from the supplied
filenames; they are not inferred on-sale dates or evidence of all inserted cards.
The two existing curated CoroCoro promo sets have explicit February 1997 and
May 2001 aliases. The other issue mappings are available when an existing set
supplies its matching issue identity/name. This change does not manufacture
79 additional card sets, promo memberships, card totals or owned quantities.

The shared `localSetArtwork.ts` lookup adds magazine issue covers ahead of the
existing Japanese-logo resolver, preserving other set artwork and custom binder
covers. It passes bundled sources to presentation components only, without
storing local bundle identifiers in catalogue, binder or marketplace records.
Marketplace set identification remains separate from the seller's photographs.

## Controls and verification

The new source-specific review records the supplied pack and the owner's exact
directions, relying on their standing assurance of app permissions. It does not
claim independent verification of a third-party licence and does not alter older
approvals, provider policies or publication gates:
`catalogue/rights-reviews/magazine-set-cover-pack-owner-directed.2026-09-06.json`.

Disable this source using `EXPO_PUBLIC_DISABLE_MAGAZINE_SET_COVERS=true`
(or the tooling/server equivalent `STACKR_DISABLE_MAGAZINE_SET_COVERS=true`).
Individual issue keys can be denied with the corresponding
`EXPO_PUBLIC_MAGAZINE_SET_COVER_DENYLIST` / `STACKR_MAGAZINE_SET_COVER_DENYLIST`.
As with other Expo public settings, a bundled setting takes effect in the next
configured build/update; this does not claim remote removal from already
installed offline bundles. Missing, disabled or unrecognised covers fall back
to the existing presentation path.

`npm run test:magazine-set-covers` verifies original file integrity, the recorded
scope, all issue mappings, ambiguity/language/disable controls and UI wiring.
These are local tests, not an installed-device or production artwork receipt.
No migration, catalogue import, server deployment, EAS build, OTA update or
scheduled follow-up is part of this addition. The coordinator owns the combined
app build and its device acceptance.

Local verification on 6 September 2026 passed: the complete magazine-cover suite,
curated CoroCoro catalogue, binder identity/presentation/quantity preservation,
foreign set picker, native-language display, shared flags and app typecheck.
App lint has zero errors and ten existing warnings. Independent review confirmed
the runtime-only source separation and the two existing promo-set aliases.
The two mapped CoroCoro cover files were also visually inspected; that is asset
inspection, not a claim that the new UI was installed or checked on a phone.

The coordinator integrated this slice into [the single TestFlight source queue](releases/next-testflight-pinned-20260906.md), fixed secondary-ID language-prefix conflicts, and verified all 81 unchanged original image hashes in the final local iOS export. That linked receipt records the superseding bundle and exact scope; native-device acceptance and hosted binder recovery are still separate.
