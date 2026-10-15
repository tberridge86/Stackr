# Magazine opening recreations — 15 October 2026

The owner requested six illustrated magazine-opening experiences and production
delivery after seeing the Shining Mew prototype. This branch adds the experiences
to the existing CoroCoro issue screen and a linked `/magazine-openings` gallery.
It does not perform the adjacent chat's artwork batches or change their ledger.

## Intended journey

Open a documented issue or choose an opening in the gallery, select a card where
the original insert held several cards, watch the peel or paper-packet sequence,
then replay or choose **Add to collection** where an exact entry is available.
Adding opens the existing private binder/quantity review; opening alone never
grants cards, coins, purchases or ownership. The four Touch Change! copies are
historical packet contents, not an automatic quantity of four in a collection.

| Opening | Contents | Collection handoff |
| --- | --- | --- |
| CoroCoro November 1996 | Pikachu; Jigglypuff | Exact catalogue mappings pending |
| CoroCoro September 1997 | Surfing Pikachu; Imakuni? | Exact catalogue mappings pending |
| CoroCoro April 1998 | Farfetch'd; Jynx; Cubone; game counters | Exact catalogue mappings pending |
| CoroCoro December 1998 | Brock's Mankey; Erika's Bulbasaur; Misty's Tentacool; Lt. Surge's Jolteon | Exact catalogue mappings pending |
| CoroCoro May 2001 | Shining Mew | Existing `ja:corocoro-shining-mew-2001` entry; Japanese, unnumbered, exact May 2001 set |
| Pokémon Card Fan Club volume 5, June 1998 | Four Touch Change! copies | Exact catalogue mapping pending; separate publication |

The twelve unmapped references remain explicit and cannot be saved from the
opening. A name, source-site ordinal or Pokédex number is never converted into a
catalogue identity. Mail-in offers, prize draws, conflicting issue associations
and unsupported publications cannot acquire an insert opening through the
resolver. The archive's existing 34-issue inventory and two Mew mappings are
unchanged.

## Design and assets

Finite native-driver transform/opacity animation, overhead illustrated paper,
Stackr's existing wordmark, typography, colours and buttons. Packet openings
animate the downward strip before the flap and card reveal. Peel openings lift
and turn the selected card. Native and app reduced-motion preferences default
to still behaviour until known; users can skip, replay, and change cards. Leaving
the foreground settles an in-progress opening; unmount and replay invalidate late
animation callbacks. Selection and narration are accessible, with live reveal
status, scalable text and controls at least 48 points tall.

All thirteen card photographs are bundled unchanged, totalling **1,490,212
bytes**. Hashes and source-page/image references are in
[`magazine-opening-artwork-20261015.json`](magazine-opening-artwork-20261015.json).
The supplied-site permission claim is retained as owner-attested evidence;
independent vendor licence verification and physical-finish verification are not
asserted. These photos are historical illustrations, not an API asset promotion
or proof of a particular physical card's finish. Some originals are small or have
photographic borders; they are not claimed as sharper replacements.

Shining Mew's HP50, Hironobu Yoshida credit, illustration and printed May-issue
footer match the documented 2001 promo. The source page's No.151 is its Pokédex
number, not a collector number. The existing exact Mew review receives the
recorded durable source URL only when the catalogue response has no artwork;
an existing usable image is preserved. No bundle-local file URI is persisted.

The paper sleeve is documented, but Mew's exact historical tear direction and
flap have not been established. The screen labels this motion a Stackr
interpretation. All illustrated packaging is a recreation, not a scanned or
purported original insert. Source history remains linked from the gallery.

## Validation and acceptance

- All thirteen JPEGs fully decode; original bytes match their recorded SHA256.
- The actual opening component's mounted regression covers six profiles, exact
  issue/distribution/name gates, native driver selection, double taps, replay and
  late completion, skip, reduced motion, preference loading, background and
  unmount, wrong-language rejection and unmapped-card refusal.
- The actual collection-action component's regression covers one private review
  for repeated taps, exact handoff, account A/B/A, authentication failure and
  sign-in routing. It does not execute a live account or binder mutation.
- Existing CoroCoro archive, route mount, cover policy and curated catalogue
  checks remain required. TypeScript and lint run against this branch; inherited
  lint warnings are reported separately from errors.
- Browser inspection renders the actual component through React Native Web,
  with explicitly stubbed local data/auth boundaries. All six openings complete
  at widths 320, 390 and 820 without overflow or runtime errors; reduced motion
  reveals immediately. It sends no non-GET requests. This is not an installed
  iPhone, native animation timing, VoiceOver or large-text acceptance receipt.
- A production-profile iOS Metro/Hermes export must contain the actual route and
  all thirteen front assets. An early export without the existing ignored
  Android configuration selected an incomplete route bundle and is rejected as
  release evidence. The matching existing Android configuration was copied only
  into this ignored isolated workspace before the final export attempt.

Final local result: TypeScript passes. Full Expo lint passes with zero errors
and eight inherited warnings outside the new files. The magazine regression,
existing CoroCoro route/archive/mobile-delivery and curated catalogue checks
pass. The corrected production-profile iOS export includes **731 asset-table
rows** and all thirteen exact source JPEG hashes. Its 11,739,020-byte Hermes
bundle has SHA256
`5a011b25fab4008c4c3f196efc639b298bb79100febaed337ac687bfed91e065`.
The existing secret scanner reports no findings in one extracted printable
bytecode-string file; this is a bounded text/string check, not native execution.

## Delivery state and remaining gates

Implementation and local checks are in this isolated branch, based on verified
main `0b6298a826caeb7c6a35117f2d1da408d8a47e06`. The original dirty checkout and
the adjacent artwork workspace are untouched. No new package dependency, backend
change, database write, catalogue promotion, native build, merge, OTA publication
or production channel change is part of these local checks.

Production delivery is explicitly authorised by the current owner request. It
is not blocked on asking for that approval again. Independent review is pending:
the side conversation forbids sub-agents, and a narrow exception was requested
before using one for this substantial new interaction and account handoff.
No reviewer has been started without that exception. Hosted checks, the exact
export receipt, release compatibility and the intended release action must be
recorded before publication. The twelve missing catalogue mappings and actual
iPhone acceptance remain unresolved and must be disclosed in any delivery.

Read-only EAS inspection confirms build 55 is production iOS 1.0.6, runtime
1.0.6, source `0188361a1b1e278ea180f9eec5ec487af52ca8cd`, build ID
`01fda53d-c962-4b2c-9c01-3ab2e29afb7a`. This is a specific observed build, not a
claim that it is the latest or installed now. The inspected production channel
was active and its production branch reported no update groups. Existing
production-canary rules require matching source-attested iOS and Android builds;
that check is not waived or satisfied by this local export.

Rollback for this source-only feature is to revert its isolated change and use
the existing mobile release/rollback lane. Previous API artwork and private
collection rows have not been overwritten, so no database or asset rollback is
required for the prepared branch.
