# Crown Zenith / Galarian Gallery fallback repair — 13 October 2026

## Implemented scope

Base candidate: PR #337, `5f83ac2aca0df79d23a5b34b72f3dee49629219a`.
Implementation workspace/branch: `agent/catalogue/reviewed-logo-fallback-20261013`.

`lib/publishedSetLogoFallbacks.ts` now selects the existing reviewed Crown Zenith
PNG instead of its older generated WebP fallback. The Gallery canonical UUID and
verified `swsh12.5gg` / `swsh12pt5gg` spellings share that parent logo. The parent's
`swsh12pt5` spelling also resolves. This changes presentation only, not set IDs,
GG numbering, membership, ownership or prices.

An explicitly requested Crown/Gallery parent also supersedes a stale child entry
in the generated snapshot. Unrelated exact-set lookups, non-English guards, the
existing MEE fallback-only behaviour and the separate cover lookup are preserved.
This is the existing published fallback lane: it does not override an already
selected live API logo, a saved binder logo URL or a bundled local asset. Those
other precedence/hydration paths and the actual phone journey remain open.

## Source and live metadata evidence

The base source was read through GitHub. The isolated baseline copy's Git blob
hash was verified as `ed84fa6a6497ac5262337b62d6973d4a54371a65` before editing.
The old generated snapshot contains Crown Zenith's `2528051d.../original.webp`
entry and no adjacent Gallery row. The existing English identity module records
both legacy/canonical code pairs.

A read-only production query in project `oakdbbzdqwurpjnoqhmu` at
**2026-10-13 06:23:48.545995 UTC** returned two approved `set_logo` records:
Crown Zenith `42096fc0-51f2-4805-a114-e6f2811a0c49` and Gallery
`8bb033f3-6059-4f5f-a021-c363241092a1`. Both record PNG, 1710 x 664, no unavailable
reason and content SHA-256
`dcc01afe69d851972c3c5a05a64fb9c939d1a5df6906e8d0b4be33f682627c92`.
The fallback reuses the parent's exact approved storage key; no object was
uploaded, republished or modified. These are metadata checks, not fetched/decoded
image or installed-device proof. This execution environment could not retrieve
the image file, so a fresh decoded-image check is still required.

## Validation actually performed

- New command: `node --test scripts/test-crown-zenith-logo-fallback.cjs`.
- Against the verified original module: **5 passed, 4 failed** (9 tests).
- Against the final changed module: **9 passed, 0 failed, 0 skipped**.
- The suite transpiles and executes the actual changed module with explicit
  generated-table/config fixtures. It covers stale/absent Gallery entries,
  canonical UUIDs, verified code spellings, English language aliases, negative
  language/prefix/near-match controls, conflicting known-set metadata, unchanged
  unrelated fallbacks/covers and nonmutation of the Gallery input.
- An isolated strict TypeScript check of the changed module with fixture imports
  returned **0 diagnostics**. This is not a whole-app typecheck.
- No React Native render, Metro export, hosted CI result, signed build, phone
  interaction or visual-sharpness result is claimed. The new focused test was run
  directly; it has not been wired into an existing CI command by this patch.

## Wider owner-supplied pack remains open

Jack's source area remains `D:\Stackr-1\assets\rev2`, starting with
`16-remaining-98-set-logos\images`. This session has no access to that drive.
No local replacement PNGs were imported or compared. Storm Emeralda M6's supplied
logo, the remaining higher-quality local replacements, direct binder enlargement
and the full-numbered-checklist fix are NOT implemented by this patch.

A separate read-only metadata inventory at **2026-10-13 06:26:35.670157 UTC** found
325 approved reviewed-logo records (213 EN, 28 JA, 37 SC, 47 TC), with 325 unique
set IDs and language/code pairs. That inventory includes small and portrait-shaped
assets; approvals/dimensions alone do not establish a high-resolution replacement
cohort or that every record is visually suitable. None of those other entries
was bulk-promoted by this patch. Do not report 325 logos imported or repaired.

## Integration and rollback

Keep this source change in the matching #337 candidate, preserving all prior
work and requiring fresh exact-head checks. Revert this focused commit to restore
the earlier fallback; there is no schema, production-data, SDK, permission,
commerce, price-worker or schedule change. Main merge, deployment, native/OTA
publication and matching-device acceptance remain separate from this repair.
