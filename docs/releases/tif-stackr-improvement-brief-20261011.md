Complete these improvements within Stackr’s existing app, components and architecture. Do not recreate anything. Preserve navigation, account boundaries, card identity, privacy, persistence and release approval rules.

First measure the current baseline. For every KPI, record the test population, device, network, sample size and evidence. Report whole-catalogue coverage separately from sampled correctness.

1. High-definition set logos
- Audit every supported set for a correct, readable logo.
- Prefer verified vector originals; otherwise use raster assets with enough pixels for the largest display at the device’s pixel density.
- Target: 100% of supported sets have a verified logo or an explicitly recorded exception.
- Acceptance: no visible blur, stretching or cropping at normal display sizes on the reference iPhone.

2. High-resolution card artwork
- Supply verified artwork for every supported card printing and language.
- Use lightweight thumbnails for lists and high-resolution images for details.
- Initial detail-image target: at least 1,000 pixels on the long edge where a legitimate source provides it. Record source limitations.
- KPI: verified artwork coverage = printings with correct artwork ÷ all supported printings.
- Release target: 100% coverage. Placeholders and artwork borrowed from another language do not count.
- Acceptance: no incorrect, stretched or cropped artwork in the reviewed cohort.

3. Correct language artwork and English translations
- Preserve exact language, set, collector number, printing and finish.
- Display the canonical English name where available; clearly distinguish explanatory translations where no canonical English equivalent exists.
- Target: 100% verified identity, artwork and English-name correctness in the declared multilingual review cohort.
- Release requirement: resolve all known mismatches; report unreviewed catalogue coverage separately.
- Never substitute English artwork for a foreign-language printing without clearly identifying the limitation.

4. Understandable set labels
- Accompany unclear, stylised or non-English logos with a readable English set title.
- Use British English for explanatory text; preserve official set names.
- Target: 100% of identified unclear logos have an accompanying text label.
- Acceptance: labels remain readable with larger text settings and have meaningful screen-reader names.

5. Fast retrieval
Measure from the user’s action to useful content appearing, not merely the API response.
- Warm/cache-hit search, set and card journeys: p95 under 1 second.
- Cold/cache-miss journeys: initial p95 target under 2 seconds; pursue under 1 second after baseline evidence identifies feasible improvements.
- Measure first usable content and full image completion separately.
- Use at least 100 observations per journey and cache condition on a stated device/network before claiming a reliable p95.
- Essential content must not wait for optional prices or enrichment.
- Report slow-network results separately. Do not hide failures or lower data correctness to achieve speed.

6. Simple, dependable API
- Simplify existing request paths only where duplication or unnecessary work is demonstrated.
- Give each supported operation a clear contract, consistent errors and explicit timeout/cache behaviour.
- Target: zero duplicated equivalent requests within one measured journey.
- Target: 100% of touched endpoints have documented inputs, outputs, authentication and failure behaviour.
- Target: at least 99.5% successful valid requests during a seven-day observation window, excluding deliberate access denials.
- Keep API timing separate from end-to-end screen timing.
- Avoid an architecture rewrite or unnecessary new services.

7. Uniform, elevated card haptics
- Apply one shared haptic pattern to the same showcase interaction across all card types and languages.
- Use restrained feedback tied to meaningful interaction moments.
- Respect device settings and prevent overlapping or repeated vibrations.
- Target: 100% of showcase entry points use the shared behaviour.
- Acceptance: no accidental double triggers, unsupported-device failures or interaction slowdown.
- In a small usability check, aim for at least 4 out of 5 testers to describe the feedback as helpful and comfortable. Report this as directional feedback.

8. Automated weekly pricing and price changes
- Prepare one weekly refresh using existing infrastructure, with retries and monitoring.
- Retain comparable previous observations with exact card identity, currency, provider and timestamp.
- Calculate changes only between comparable observations; clearly handle missing or changed sources.
- Target: at least 99% of scheduled jobs start within one hour of their scheduled time over a rolling eight-week window.
- Target: at least 95% of provider-supported, eligible card/finish combinations refresh successfully within 24 hours.
- Track provider-supported coverage against the whole catalogue separately.
- Target: 100% of shown changes have traceable previous/current observations.
- Mark eligible prices older than eight days as stale. Preserve the last valid quote after a failed refresh.
- Never imply that a weekly observation represents a confirmed sale.

9. Exact CoroCoro magazine/card correlation
- Verify issue date, edition, source document and associated cards against authoritative evidence.
- Distinguish cards included with an issue from cards merely featured or advertised.
- Preserve exact printing and language identity.
- Target: 100% of supported magazine issues have an evidence-backed card list.
- Acceptance: zero known incorrect associations, duplicate entries or omissions within the supported scope.
- Ambiguous issues remain explicitly unresolved until evidence settles them.

10. Scanner ready for recognition testing
- Provide a working installed-device path from camera access through capture, recognition, candidate confirmation and card details.
- Prepare a labelled benchmark using verified card identities and authorised images or physical cards.
- Initial benchmark: at least 200 trials across representative languages, sets, finishes, lighting and angles.
- Proposed controlled-condition targets: at least 90% correct top-choice identification and 97% correct identity within the first three candidates.
- Measure difficult conditions separately rather than blending them into the controlled score.
- Recognition latency target: p95 within 3 seconds on the stated device/network.
- Report exact-printing accuracy separately from card-name accuracy.
- Uncertain results must request confirmation; never silently save an ambiguous match.
- Scanner readiness means the benchmark can be run reproducibly. Recognition acceptance requires measured results.

DELIVERY RULES

Maintain one ledger:
Target | Baseline | KPI | Coverage/sample | Evidence | Remaining gap | Delivery state

Track prepared, tested, reviewed, deployed and installed-device verified separately.

Prioritise incorrect identities and artwork, missing artwork, CoroCoro mappings and retrieval blockers before cosmetic polish. Prepare weekly automation and release changes for review; apply them only within existing approval authority.

Do not claim Stackr is complete until catalogue coverage, measured performance, pricing automation and installed-device acceptance meet the agreed targets. Record exceptions honestly.
