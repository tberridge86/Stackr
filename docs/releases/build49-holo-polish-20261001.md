# Build 49 inspector holo polish candidate

## Source and imported proof

This candidate starts from merged source `83394561744ac7d4031b029d8bfe13290ab4622f`. The imported patch was prepared against `97f69d3f0528fb22f37b31f68b1dcf4bce815aa4`; both revisions have the same source tree. The applied patch SHA-256 is `618f42844816bd3f2007f5899611c35f4c1775afdc4c6add3aaf90c239b6e6f5`.

The preserved evidence is byte-bound in [holo-before-after.png](evidence/build49-holo-polish/holo-before-after.png) (`3dd46e0766229f232435f74467c8d5a7e2e827d6968ee9050e07a7c625cda1e9`) and [handoff.json](evidence/build49-holo-polish/handoff.json) (`bb63c576f0bf777f182b7540709b6b12b80a7497fed0373718b7f9123cdc4dd7`). The evidence directory declares JSON as non-text in `.gitattributes` so the imported JSON digest remains stable.

## Change

The enlarged inspector keeps the existing calibrated gyro/drag engine and source artwork. It adds a directional sheen within the existing foil mask/shader, modestly raises the generic verified-finish multiplier, adjusts only the enlarged card shadow, and introduces a separate Rigid inspection-open haptic with a 250 ms cooldown. Exact printing/language/finish identity, mask precedence, non-holo behavior, Reduce Motion, background/sensor cleanup, haptic preference, pricing, holdings, navigation, and scanner haptics remain covered by the existing paths.

## Proof and limits

The imported handoff records CPU/WASM rendering of a synthetic before/after swatch and assertions for shader bounds, lifecycle, motion, material/identity masks, and inspection haptics. This source integration runs the complete existing card-inspection suite and TypeScript check.

Neither artifact proves device behavior. Pending installed-device checks are tilt smoothness and native GPU performance, the Rigid haptic feel, iOS shadow/rendering and long-press behavior, and Reduce Motion and disabled-haptics behavior. This candidate does not claim altered card artwork, metadata, pricing, holdings, or any production/native release.
