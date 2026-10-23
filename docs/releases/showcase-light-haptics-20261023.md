# Showcase lighting and haptics — 23 October 2026

Base: `f4d458bd3cc6962bde2f150e3a28f4297df297b2`.

The owner requested a dark, cinematic Stackr card showcase, corrected lighting,
and feedback during card movement. This is a focused app-source repair; it does
not establish completion of the other Build 60 video faults.

## Corrected behavior

- A loaded catalogue card can use explicitly labelled neutral studio lighting.
  Previously the light switch depended on the empty reviewed-material registry,
  making it unavailable for every current ordinary card.
- White studio reflection follows the existing UI-thread tilt/drag values and
  stays inside the rounded portrait card face. It introduces no foil texture,
  rainbow, finish assignment or catalogue/price/ownership change.
- Exact printing-specific foil remains behind the unchanged material resolver
  and reviewed registry. Optional foil failure leaves studio lighting usable.
- Movement feedback now follows combined drag and sensor values, rather than
  sensors alone. Neutral-before-crossing hysteresis and the shared 800 ms studio/
  foil cooldown prevent continuous or delayed sweep feedback.
- Showcase controls use a dedicated preference-aware cue whose generation and
  live foreground guards expire after dismissal, replacement or backgrounding.
  Reduce Motion still stops the sensor, lighting, gesture and movement cue.
- Old image-load/error callbacks cannot hide a newer loaded full-resolution
  image or suspend the current card. Image-generation regression covers this.
- Deep navy, off-white type, the existing purple accent and the actual Stackr
  wordmark replace the unbranded charcoal chrome. All current viewport fitting,
  accessible controls and deferred navigation are retained.

## Validation and delivery limits

Root TypeScript checking and lint pass (zero errors; eight existing lint
warnings). Focused React/native-boundary checks pass: stage 67 checks, lifecycle
42 cases, showcase 17 cases, plus haptic dispatch/cooldown/preference tests.
The existing inspection suite retains the exact-material, CPU/WASM shader,
source identity and condition-photo safeguards. Stage tests are now included in
that existing suite so hosted checks exercise normal-card studio lighting and
stale image callbacks.

Independent read-only review reproduced a stale full-image callback race;
the final image-generation guard and regression corrected it. The reviewer
replayed the focused checks and found no remaining blocking runtime finding.

These are source and mocked/native-boundary results, not measured iPhone
appearance, felt haptics or native GPU performance. No backend deployment,
database/catalogue mutation, provider pull or native/OTA publication is made by
this app-source change. A new app delivery still needs its normal release path.

On the delivered candidate, check a plain card, a known foil without a material
pack, image fallback/high-resolution failure, light on/off, slow drag and tilt,
recenter, saved haptics off, Reduce Motion, background/resume, landscape and
repeated close/reopen. Verify the actual light remains within the card face and
that closing never leaves a queued vibration or sensor subscription.
