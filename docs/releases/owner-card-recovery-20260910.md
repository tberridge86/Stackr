# Owner card recovery release — 10 September 2026

This continuation packages the reviewed API/image recovery and light lilac UI from PR 168 with fixes for official binders, enlarged cards, scanner lifecycle and owner price requests. Native release receipts will identify the final built commit; this source report alone is not a TestFlight delivery receipt.

## Changes and evidence

- Evolving Skies already contains 237 distinct cards and 370 variants, with current direct or explicitly shared artwork for every variant. The owner's three saved rows were displayed when the catalogue failed. The client now avoids caching that fallback as a complete binder, reads one set's metadata rather than all sets for binder details, and prefers the canonical API for English as well as other languages. A regression simulates the failure, recovers 237 slots, retains the one owned row and saved quantities, and confirms subsequent cache reuse.
- Public Evolving Skies pagination returned 237 distinct cards in 3,864 ms on the first measured read (one cached page), then 284 ms with both pages cached. This is API retrieval, not cold launch or image decode time. In the signed-in browser preview, retry replaced the three saved cards with the populated catalogue and displayed 203 regular printed slots with Master set off.
- Enlarged card details now respond to calibrated device rotation and one-finger drag. A restrained moving sheen is applied only for a supported foil finish; it does not alter the actual source image or stored finish. Motion stops when inactive, unfocused, in the background or when Reduce Motion is enabled. The installed Reanimated sensor handles unavailable hardware and unregisters on unmount; drag remains available when no readings arrive.
- Binder quick actions wait for the iOS sheet's actual dismissal before opening a second native modal. The scanner unmounts its camera when its navigation screen loses focus. This avoids leaving an active camera behind other controls; active camera sessions can suppress iOS Taptic feedback. Existing tab, long-hold, capture/result and feedback-setting paths remain mounted.
- The manual Home price queue had no automatic consumer for its exact pricing pipeline. A protected owner-only consumer processes up to three explicit requests every ten minutes, oldest first. Home rechecks stored prices while focused and distinguishes queued, newer, partial and still-unavailable results. Provider coverage remains restricted to exact supported raw Near Mint normal GBP identities. Automatic provider cadence remains six-hour; manual requests do not trigger a full collection sweep. The job guard flag belongs at repository scope; the owner ID belongs in the production environment.
- The frozen native build workflow previously selected an older hard-coded commit. It now requires an exact reviewed main SHA and attests the checkout before building, preserving production endpoints, the owner channel/runtime and remote build-number increment.

## Data and remaining gaps

The existing production map remains Supabase `oakdbbzdqwurpjnoqhmu` for published catalogue, source/asset identity, prices and private account data; `stackr-catalogue-public` for approved public image bytes; Railway for API reads/price work; Cloudflare `api.stackrtcg.com` for gateway delivery. The app uses canonical set/printing/variant IDs, language and finish, with approved external aliases. Staging `lmwfhvexfcoyeuoyrlco` and private teaching captures are not interchangeable public artwork sources.

The previous recovery restored 5,271 current variant-art links across 105 sets. The catalogue-wide baseline after that recovery is in `captured-artwork-coverage-20260910.json` and `.csv`: 696 sets, 75,752 variants, 14,186 missing current ready links. These are variant-link gaps, not 14,186 distinct missing images. Further bounded PokeData recovery receipts supersede the M5/SM6 portion when completed. Existing native-language art is retained. Unverified Chinese/Taiwanese byte-identical staging associations and unmatched historical Japanese identifiers remain withheld pending exact identity evidence. See `set-art-and-names-20260910.md` for current labels and original logos.

Remaining limitations: catalogue completeness and provider price coverage are not universal; the local web preview cannot validate authenticated production pricing where CORS prevents that origin. Native haptics, physical tilt, camera recognition and private teaching persistence remain pending iPhone verification. Marketplace shared demand/Market Movers remain incomplete. No web screenshot or successful upload establishes those device outcomes.

## iPhone acceptance

1. Confirm the released version/build and owner update identity in Profile. Cold launch should reach Home with the lighter white/lilac surfaces.
2. Open Evolving Skies: check the full printed set, then Master set for extras; retain existing ownership. Open Abyss Eye and Forbidden Light and check the restored artwork after the production recovery receipt.
3. Hold a card, choose Details, drag and tilt the phone. Compare normal versus holo. Use Profile's feedback test, change tabs, then leave Scan and repeat the card feedback test.
4. Open Home stored collection values. Request a manual refresh; queued is not a fresh quote. Confirm any later quote keeps exact language/finish, GBP, source and timestamp.
5. Capture a real card, review/correct language, set, collector number and finish, explicitly save a private teaching example, reopen and verify persistence.
