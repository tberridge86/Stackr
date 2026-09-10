# Set artwork and English display names — 10 September 2026

Current scope: the 696 canonical published production sets, with client display-name resolution at candidate 4876683. This is not an installed-iPhone or complete set-cover coverage audit.

| Language | Published sets | English display label resolves | Translation pending |
| --- | ---: | ---: | ---: |
| English | 217 | 217 | 0 |
| Japanese | 163 | 161 | 2 |
| Simplified Chinese | 136 | 136 | 0 |
| Traditional Chinese | 83 | 83 | 0 |
| Korean | 97 | 2 | 95 |
| Total | 696 | 599 | 97 |

Resolved means the existing client returns an English label; it does not certify every translation as authoritative or every catalogue identity as correct. Japanese pending identities are ADV4 (ab5b47d9-7548-4f9f-96fe-30a12f041d78) and ADV5 (2e6d5f2e-8528-439f-9506-e4c84df8f2dd). No existing approved name-map or bundled logo-pack entry was found for those codes. Korean identities require review before any labels are copied from another language.

## Existing artwork
- Perfect Order's current production original is a 604 × 242 transparent WebP. Pixel inspection found 53,368 fully transparent pixels and all four corners transparent. The original artwork is present.
- Perfect Order's current public logo/symbol manifest requests returned HTTP 200 in 934 ms / 241 ms from this workspace. These are single observations, not iPhone latency claims.
- The current browser preview initially failed its set load, then displayed the small POR symbol, then displayed the full original logo after a fresh read. This establishes inconsistent mark delivery/loading, not absent source artwork or a complete performance fix.
- Abyss Eye has a bundled original logo at assets/rev2/11-japanese-set-logo/logos/m5.png.
- The Japanese pack has 204 logo bindings. The 81 supplied comic/magazine cover files and mapping/surface checks passed. These pack counts are not counts of current published sets with rendered artwork.
- The bounded production audit found no eligible unlinked set_logo/set_symbol assets for current published set identities. This does not audit every cover pathway or alternate historical identity.

## Client change
Binder Detail now includes the saved official set cover before remote logo/symbol fallback. Existing bundled set-art preference and configured character cover selection are preserved. No catalogue or storage row changed.

Validation: app typecheck passed; app lint passed with zero errors and nine existing warnings; changed-file lint passed with zero errors and six existing warnings. The magazine-cover pack/mapping/surface tests also passed. This one-line client fix is local release-candidate work and has not been uploaded to TestFlight.

Local evidence:
- outputs/set-names-current-input-20260910.json
- outputs/set-names-current-report-20260910.json
- outputs/perfect-order-logo-pixels-20260910.json
- outputs/perfect-order-set-mark-probe-20260910.json

Remaining: verify all set-logo/cover surfaces with live data; resolve intermittent metadata-loading failures; review the 97 unresolved name identities; complete native-device verification after release.
