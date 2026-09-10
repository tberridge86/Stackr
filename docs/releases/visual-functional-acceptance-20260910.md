# Stackr visual and functional acceptance — 10 September 2026

**Overall result: NOT ACCEPTED as the owner's complete testing experience.**
Build availability, package markers and passing source checks did not establish
the requested appearance or completed user journeys. This review uses build 34
source `6f439fd9bcf31dc69adbf55e4ebe6c4785e77b1e` and PR #168 candidate
`9fdbeb06d6b2fe117bf345ae6a6407cebb71553e`, followed by the focused marketplace
layout correction recorded with this receipt. No runtime deployment or new
TestFlight/OTA publication was performed by this review.

The owner reports running build 34. Its current received update and physical
device behaviour still need confirmation. The local preview is Expo Web at
393 × 852 CSS pixels using production connection settings and the browser's
existing account session. It is not the installed iPhone binary. Its standard
production preview profile also does not establish owner-native recognition
flags. Private account screenshots stay in the owner's conversation, not this
public repository.

## Expected appearance

The owner's later feedback rejects the navy feature treatment and then the
large dark charcoal treatment. Review the lighter candidate: predominantly
white/light surfaces, readable plum text, purple actions/selection, restrained
accents, consistent navigation strokes, original set logos and artwork providing
visual interest. The newer direction is not satisfied merely by finding colour
constants in a bundle. Preserve the existing layout and verified source artwork;
do not invent translated names, prices or substitute card languages/finishes.

Rendered Home shows the lighter binder panel, white surfaces and the new
consistent navigation. Build 34 has the earlier navy tokens. This is a concrete
source/delivery mismatch with the later request. Full aesthetic/device acceptance
remains open; the rendered Home still lacks useful collection pricing.

## Reproduced failures and focused correction

1. **Public card-reference search fails for an existing card.** At 16:46 UTC,
   `me2-125` returned a downstream timeout after 9,636 ms. A later request took
   3,917 ms and returned HTTP 200 with no results; a cache hit repeated that empty
   result in 135 ms. The canonical control `me02 125` returned Mega Charizard X ex
   with exact English identity in 1,971 ms. Fast empty responses must fail
   acceptance. PR #168's backend lookup repair remains unshipped.
2. **Marketplace listing columns collapsed in the actual web rendering.** At
   393 CSS pixels, the row had 361 pixels available but each wrapper measured
   zero width and its button only 16 pixels. The multi-column wrapper's `flex: 0`
   produced a zero flex basis despite its calculated width. Explicit non-growing,
   non-shrinking wrappers restore 175.5-pixel cards in two columns. Existing
   seller images, titles and navigation then render. This is browser evidence;
   verify native layout separately.
3. **Compact offer labels competed with duplicate badges.** The repaired cards
   exposed a truncated `Offer...` heading next to an identical `Offers only`
   badge. Suppress only identical compact labels; retain distinct price/status
   information. The actual rendered heading now reads `Offers only` in full.
4. **Home pricing remains unresolved, and this preview cannot validate it.** The production-connected account preview
   displayed saved binder content alongside a pricing failure and no stored
   market estimate. Browser logs also contain direct gateway fetch failures and
   a timed-out preview proxy read. This does not by itself prove the same native
   failure or its cause; separate browser-origin/proxy failures from API and
   identity/coverage failures before closing it. Source review confirms the
   loopback proxy only forwards anonymous `/sets` and `/assets/manifest` reads;
   it excludes search and pricing and strips authorization. Authenticated calls
   stay on the direct gateway origin and are subject to its exact CORS allowlist.
   This preview is therefore insufficient evidence for signed-in native pricing.
5. **Manual refresh does not follow job completion into Home.** Source queues
   work, immediately reads stored prices and then relies on the ordinary focused
   polling interval. There is no completion-driven refresh of the resulting
   value. The six-hour worker's repeated first-30 selection and unsupported
   identity coverage remain separate pricing problems. A queued job is not an
   updated collection value.
6. **Prismatic search is only partially useful in the preview.** Ten sealed
   products render while an alert reports that cards and sets could not load.
   Preserve those usable results and the honest failure state, but do not count
   it as a successful card/set search. Browser-origin limitations above apply.
7. **Collection presentation still needs a pass.** Original Abyss Eye and
   Evolving Skies logos and binder artwork visibly render. The narrow header
   truncates `Collection Vault` and the scan action in the web preview. Inside
   Abyss Eye, native Japanese card faces render alongside some explicit `No image`
   slots and English `translation pending` identity labels. This is a partial
   artwork/metadata result, not complete translated or illustrated coverage.
   The tested quick-actions `Details` action closed its sheet without producing
   a visible detail modal in this browser session; enlarged-preview acceptance
   is still open. No card ownership, chase or visibility control was changed.

The [public search observations](public-search-acceptance-20260910.json) retain
timestamps, request IDs, result identities and cache state. Japanese `SV2a 157`
returned the expected card and separate normal/reverse-holo variants, with cache
hits of 151 and 106 ms. Only the normal variant carried an embedded image in
that response. This is a small diagnostic cohort, not a whole-catalogue benchmark
or an end-to-end device performance claim.

## Acceptance required before the next complete-build claim

| Journey | Pass evidence | Current result / accountable owner |
| --- | --- | --- |
| Home and navigation | Actual candidate screen at iPhone size, readable hierarchy, approved light treatment, consistent icons, no clipping or misleading populated/empty states | Light treatment rendered; pricing panel fails. Release coordinates visual acceptance. |
| Marketplace | Legible cards at narrow/wide sizes, decoded intended photos, understandable prices/offer states, working detail/back/filter journeys | Collapsed web columns and duplicate compact labels corrected locally; full journey/device check pending. Release. |
| Search | Known queries return expected canonical IDs, language, set, number and finish; negative control stays empty; time to useful results measured | Existing English alias fails production; Japanese control succeeds. Performance + Backend, using PR #168. |
| Sets and artwork | Published membership, native-language images, verified English surrounding names, original logos, decoded thumbnails and best available enlarged source | Historical coverage receipt is not a rendered pass. Catalogue + Performance. |
| Collection and binder | Correct owned population, quantities, chosen finish, images and retained state across navigation/restart; measured initial and cached reads | Existing content is visible; full signed-in/device persistence and timings remain open. Performance + Catalogue. |
| Prices and insights | Exact supported identity, coverage denominator, source/currency/provider time, truthful missing/stale states, completed refresh reflected on Home | Coverage/selection and completion-to-screen gaps remain. Pricing + Backend. Minty fallback is not a delivered live insight service. |
| Scanner and teaching | Real capture, recognition, correction of language/set/number/finish, explicit private save/upload and durable retry; collection save tested separately | Standard capture already dispatches Expo haptics and links to private teaching in the owner build. No missing-wrapper inference. Real camera/private persistence require the owner build and device. Release. |
| Haptics and startup | Actual mounted tabs, card taps/long-holds, capture/results; feedback setting/test; no stuck startup and understandable retry | Source paths exist; physical vibration, launch timing and received update remain pending. Release + owner device confirmation. |

For every row, record the source, running API/database revision where relevant,
audience/update identity, observation time, expected result, actual result and
pass/fail/pending state. An HTTP 200, a stored file, an enabled schedule, a mocked
test or a successful native upload cannot substitute for the screen result.
Keep browser-specific limitations explicit. Do not change production CORS or
weaken authenticated routes simply to make a local preview green.

Retain the user's scope: all supported sets/languages/categories and captured
variants, with catalogue-wide inventory plus representative rendered journeys.
Prismatic Evolutions, Abyss Eye and Perfect Order are regressions, not the entire
coverage population. Marketplace demand/Market Movers, unavailable provider
coverage and physical-device gaps cannot be labelled complete by this patch.

## Validation and integration

Typecheck passed after both UI edits. Standard lint passed with zero errors and
nine existing warnings; targeted lint for both edited files passed without
warnings. Independent review found no blocker in the layout/badge correction.
Rendered card/wrapper widths after the fix were 288 pixels at a 320-pixel
viewport (one column), 175.5 pixels at 393 (two columns), and 405 pixels at 852
(two columns). The viewport override was reset after testing. These are measured
browser layouts, not native-device screenshots. Keep
these two focused UI corrections in PR #168's existing workstream. The five
existing owners acknowledged the acceptance requirements through their
coordination task; no duplicate agents or schedules were created. Release owns
integration; specialists provide evidence for their respective failing rows.
