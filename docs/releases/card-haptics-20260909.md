# Card feedback repair — 9 September 2026

The user reported that card haptics were not working in their installed app. Physical behaviour on that phone is not observable from this workspace; this repair closes verified gaps in the current release source.

The shared native helper was enabled by default. A card component with an existing haptic wrapper (`StackrCardTile`) is not mounted anywhere in the app, so its implementation did not cover actual card interactions. Several mounted card handlers made no haptic request; binder/Pokédex previews used a subtle selection request.

- Card detail and preview actions now use `cardPreview`: one medium native impact with a 120 ms duplicate cooldown.
- Covered controls: search card rails/results; binder details, variant previews, top-loader quick actions and add-card search; the separate binder add-card picker; set card details; Pokédex long holds; inventory raw-card long holds.
- Card selections, quantity-picker opening, quick-add touches and binder-cover options use selection feedback. These acknowledge interaction, not a successful database write.
- Existing scanner feedback remains unchanged. Shared global buttons remain haptic-free so unrelated forms do not acquire duplicate feedback.
- The existing Settings → Touch feedback test uses the same medium native impact. A resolved request confirms dispatch only, not physical feedback. The enabled setting and web no-op remain respected; native failures do not block navigation or card actions.

Validation: `npm run test:card-haptics`, `npm run typecheck`, `npm run lint`. The focused test executes the real helper with a mocked native module, verifies medium impact/cooldown/disabled/web/failure behaviour and executes actual card press handlers. The native dependency already exists; no additional haptic permission or dependency is introduced.

After installing the next native build, verify binder grid and finish previews, top-loader long hold, search-card opening and card selection, then the Settings feedback test. Record the installed build/update reference and whether each pulse is felt. Do not mark iPhone verification passed until the user confirms it.
