# Printing-specific material maps — draft, 2 October 2026

Extends the existing PR298 showcase at `19a58c946cd038c98cb9e4d631c0440346e5ade7`.
This is an isolated integration candidate, not a deployment or a completed real-card material library.

## Implemented

- Four independent pixel maps: foil coverage, tangent-space surface normals, directional/spectral pattern, and optical roughness/reflectance/metallic response.
- An original SkSL renderer that consumes those maps. No generated grooves, noise or timer is used in the exact-map path. Existing gyro/drag, haptics, artwork caching and inspector lifecycle are reused.
- Exact matching of canonical printing, language, variant ID, variant code, finish code and the configured artwork URI. Conflicting material versions fail closed. A contained-image transform keeps the maps off letterbox margins.
- Local-only PNG data. The intake tool checks hashes, CRCs, PNG row filters, dimensions, opacity, normal vectors, source/evidence identity and decoded-memory budget. No new remote asset fetcher, provider, native package or catalogue mutation.
- Failed optional map decoding falls back to the existing material without hiding the artwork. Seller condition photographs cannot enter either renderer.

## Fidelity status — do not promote these numbers

**Verified real-card material packs: 0.** The production registry is deliberately empty.
The supplied abstract laboratory textures and the runtime test records are synthetic. They are not Pokemon cards, physical captures, approved catalogue entries, or evidence of matching a real foil pattern.

The existing reference audit excludes source code/textures from the previously evaluated effect projects. No such assets were copied. The inspected Stackr code and repository search did not locate a reusable approved PokeSim map pack. This is not a claim that no such files exist on the owner's computer.

The renderer and the asset library are different deliverables. This patch implements the former and the map-pack intake. It does not create verified physical detail from a flat illustration, and it must not be described as completing the owner's intricate holo requirement.

## Map contract

All four maps use the same dimensions and are opaque 8-bit, non-interlaced grayscale/RGB/RGBA PNGs without colour-transform, animation or transparency metadata. RGB data remains in its encoded channel space; GPU validation must confirm channel interpretation.

| Map | Channels |
| --- | --- |
| coverage | R: foil coverage, zero protects artwork/text |
| surface | RGB: unit tangent-space normal encoded from [-1,1] to [0,1], Y up and positive Z |
| pattern | R: spectral phase; G: diffraction strength; B: tangent orientation over one full turn |
| optical | R: roughness; G: reflectance; B: metallic/spectral mixing |

There is no algorithm here that reliably infers embossed geometry from printed colour. Normals, coverage and patterns must be authored or reconstructed from matching physical references and reviewed against them.

Four maps have a combined 24 MiB decoded-RGBA cap. This does not include base-artwork memory, encoded strings, transient decoding, GPU copies or driver allocation and is not a measured peak-memory claim.

## Preparing a reviewed pack

Run `node scripts/prepare-printing-material-pack.cjs MANIFEST.json NEW_OUTPUT.json`.
The output path must not already exist. The command never changes the registry or publishes anything.

The manifest contains schemaVersion=1, materialVersion, exact canonical identity, artwork file/hash/HTTPS URI, four map file/hash records, gain in (0,1], and a reference-reviewed review record. The evidence record is hash-bound to that review. It must retain sourceType=physical-reference, the same identity, a rights/source record, front/tilt/macro file hashes, and recorded identity, foil-boundary, angular-response, texture and artwork-alignment review results. Evidence and map files must remain inside the supplied pack folder.

This is an integrity and review-record check, NOT an authenticity oracle. A test or invented review record cannot turn an approximation into a verified material. Review the actual references before marking any pack reference-reviewed or adding it to the registry.

## Executed validation

`node scripts/test-printing-materials.cjs`: **55 local checks passed**, zero failed. Scope: synthetic pack round-trip, identity/variant/language rejection, ambiguous versions, missing maps, invalid data, gain limits, checksums, PNG filters/CRC/transparency, normal-vector validation, contain geometry, and source/syntax integration checks.

Four separately generated 256x356 Pillow PNGs (coverage, surface, pattern and optical) decoded in the Node intake tool with byte-for-byte matching decoded-pixel SHA-256 values. These are synthetic laboratory fixtures, not verified card assets.

These results do not establish full-project TypeScript compatibility, SkSL compilation/pixel correctness, React/native lifecycle behaviour, visual fidelity, actual image-fallback alignment, frame rate, memory, battery performance or physical phone acceptance. No existing full application or CI suite was claimed as executed in this environment. Run the new test command with the repository's existing TypeScript dependency installed.

## Remaining gates before enabling any real material

1. Recover or create a legitimate reference pack for one smooth AR/IR and one etched SAR/SIR, plus a nonfoil control and missing-material fallback. Match exact language and variant; do not select by rarity alone.
2. Confirm the image actually displayed by StackrImage, including progressive and error fallback paths, matches the pack's source/crop. The current binding is the configured URI, not a cryptographic attestation of displayed pixels. Keep the registry empty until this is verified or actual displayed-source attestation is added.
3. Validate the exact shader with the repository's installed Skia/CanvasKit versions and actual native image-shader inputs. Check opacity-zero protection, normal directions, channel colour handling, angle changes and shader failure fallback.
4. Run full project typecheck, existing inspection/regression suites and native rendering/lifecycle tests. The new standalone tests are included but are not claimed to have run automatically in CI.
5. Compare the material beside its physical reference through slow tilt, then measure phone frame time and memory. Retain sharp artwork and one-gesture inspection. Do not claim elaborate, printing-accurate completion from a synthetic swatch.

## Scope and rollback

No merge, main-branch change, production deployment, catalogue publication, pricing/holding mutation, native build or OTA is part of this work. The held artwork97 batch and queued retrieval deployments are unchanged. Removing the new native selection wrapper returns to PR298's existing fallback renderer. Preserve PR298 and coordinate the stacked draft with its release owner rather than replaying PR209.
