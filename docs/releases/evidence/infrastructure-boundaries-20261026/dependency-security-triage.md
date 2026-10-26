# Dependency security triage

Source: `6bff5300db49a7b55dc14f44346183ca0ac2e6a0`; CI run `40360629670`, job `121704767741`. Read-only inspection of the three preserved `npm audit --omit=dev` reports, lockfiles and named source. No upgrades, network probes or exploit tests.

Backend: **3 high package rows / 4 distinct high GHSAs**. Root: **19 high package rows = 14 leaf package groups + 5 inherited parent labels**, containing **41 distinct high GHSAs**. Two IDs overlap backend/root, giving **43 distinct IDs overall**. Gateway production audit reports **0 vulnerabilities**; this does not cover omitted development tooling or deployed configuration.

## Backend first

| Package / locked version | Advisory | Source reachability | Range boundary to investigate |
| --- | --- | --- | --- |
| body-parser 1.20.8; transitive via Express 4.22.3 | GHSA-27r3-jxmh-p828: compressed-body trailing-byte DoS | `backend/server.js:95` parses JSON before the v1 origin-auth layer at line100. The 8mb limit is present; its effect on this specific fault was not tested. | 1.20.9 |
| compression 1.8.1; direct | GHSA-vc2v-76pw-4v95: premature-close memory leak | Active v1 middleware at `backend/server.js:100`, after origin auth, threshold1024. Reachable lane; no memory-leak reproduction. | 1.8.2 |
| follow-redirects 1.16.0; transitive | GHSA-q3jh-wrc6-jgq8 and GHSA-8r9p-f939-6h3c: redirect credential/header handling | Jimp print/font chain (`load-bmfont -> phin -> centra`), **not CardSight/axios**. Project calls `Jimp.read(imageBuffer)` at `backend/server.js:3643/3724`; no project font/print call or advisory-specific header configuration was found in the bounded inspection. | 1.16.1 |

## Root findings

The JSON companion lists every exact GHSA/range, locked instance, dependency path and npm fix suggestion. These groups are largely Node build/configuration dependencies, despite being in the production dependency graph; that is not proof of phone or public-server reachability.

| Leaf package (locked version) | Distinct high IDs | Boundary targets / qualification |
| --- | ---: | --- |
| @xmldom/xmldom (0.8.13, 0.9.10) | 12 | 0.8.15, 0.9.12 |
| body-parser (2.2.2) | 1 | 2.4.0 |
| brace-expansion (2.1.2, 5.0.7, 1.1.14) | 5 | 1.1.21, 2.1.7, 5.0.12 |
| browserslist (4.28.2) | 2 | 4.28.7 |
| compression (1.8.1) | 1 | 1.8.2 |
| fast-uri (3.1.2) | 7 | 3.1.9 |
| image-size (1.2.1) | 2 | 2.0.3 |
| js-yaml (3.15.0, 4.3.0) | 2 | 3.15.2, 4.3.2 |
| nanoid (3.3.12) | 2 | 3.3.18 |
| node-forge (1.4.0) | 1 | >1.4.0 required; concrete patched node-forge release unverified |
| postcss (8.4.49) | 2 | 8.5.23 |
| source-map-js (1.2.1) | 1 | 1.2.2 |
| tar (7.5.20) | 1 | 7.5.21 |
| undici (6.27.0) | 2 | 6.29.1 |

Boundary targets are inferred from the audit ranges, **not registry-verified remediation versions**. Some targets clear moderate/low findings too (for example PostCSS8.5.23 and fast-uri3.1.9). The five inherited labels are `@expo/cli`, `@expo/code-signing-certificates`, `expo`, `expo-updates`, and `@stripe/stripe-react-native`; the Stripe row has no Stripe-specific GHSA object. Audit suggestions to move Expo54.0.36 to44.0.6, expo-updates29.0.19 to0.11.7, or Stripe0.50.3 to0.18.1 are breaking **downgrades**, not an approved repair plan.

Root Express/body-parser is observed in local HTTP test consumers, distinct from the dedicated backend installation. Nanoid is navigation-transitive, but negative/zero generator-size inputs were not demonstrated. App update APIs are referenced in `app/about.tsx`; that does not establish that the affected node-forge JavaScript verifier runs in the native client. No direct app-facing uses of the other listed toolchain parsers were established.

## Practical next step and limits

Start a controlled backend patch unit for body-parser/compression, then assess the redirect dependency and compatible Expo toolchain remediation. Retain the existing complete-identity, cancellation and release checks. Do not infer exploitability from an advisory or blindly apply `npm audit --force`.

The current Platform audit gate passes `--max-critical=0` only (`.github/workflows/platform-ci.yml:401-403`); `check-dependency-audit.mjs:16` defaults the high threshold to MAX_SAFE_INTEGER. Passing CI therefore does not mean zero highs. Candidate CI package evidence is not a live deployment SBOM. Exact exploit preconditions, package inclusion in the shipped binary, current patched release availability and deployed versions remain unverified.
