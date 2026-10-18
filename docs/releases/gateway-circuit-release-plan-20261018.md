# Gateway circuit isolation release plan — 18 October 2026

The current gateway can reject healthy card requests after optional image
manifests fail. The reviewed repair separates only the existing asset-manifest
circuit, preserving each circuit's protection. It does not establish or repair
the preceding database/Storage timeout cause.

Candidate source is `8b5ebc753ade3feaf574b21a8b6b01efa79ad582` in
[PR #409](https://github.com/tberridge86/Stackr/pull/409). The
[repair evidence](gateway-circuit-isolation-20261018.json) records four original
failures followed by four passing regressions, all 55 gateway tests passing,
independent review and a successful local build without upload. Later evidence
commits do not change that gateway source identity. No gateway publication has
occurred.

The existing release lane is
`.github/workflows/deploy-gateway-privacy.yml`. It requires an explicitly
approved merge and exact successful main CI before its manual production
dispatch. Re-attest current source and traffic immediately before deployment;
stop if the worker, route, runtime bindings, durable-object identity or previous
version differs from the reviewed plan. Preserve the existing production
configuration, credentials and owner access settings. Do not include unrelated
staged backend changes or publish native/OTA builds.

The read-only rollback observation identified:

| Item | Exact identity |
| --- | --- |
| Worker | `stackr-api-gateway`, production |
| Custom domain | `api.stackrtcg.com` |
| Deployment | `946af123-25ca-4a8b-89f1-e441b52f8bb0` |
| Full-traffic version | `71032825-4494-46c2-82b0-de3a21d6953d` |
| Version tag | `gateway-privacy-ea8190f3a0bda642e266438b68f19d4f398f7845` |
| Durable object | `GATEWAY_STATE` / `GatewayState` / `aa7d685ce0ee4139b5b70cf0b33db23c` |

The candidate gateway runtime differs from that tagged source only in
`gateway/src/proxy.js`. Its new key is fixed and does not include card, query,
user or device data. Existing backend circuit state is retained until its normal
cooldown; it is not manually reset. The observation is a point in time, not
permission to publish or a substitute for the release lane's fresh attestation.

After matching explicit approval, merge only the reviewed current PR head once
its applicable checks pass, require exact resulting main CI, then use the
existing guarded gateway-only release lane. Verify the new version at 100%
and its unchanged durable-object namespace. Use the lane's anonymous privacy
checks and retain its exact previous-version rollback on failure. No provider
refresh, authenticated collection valuation, remote database script or job
restart is part of this release.

Afterwards, make bounded public factual and exact artwork reads for Storm,
Pikachu and Wartortle. Preserve failures as well as successes. Do not force
production failures to demonstrate the breaker. A successful response does not
establish complete artwork coverage, latency percentiles, signed native
delivery or installed-phone acceptance. Repeat the recorded Wi-Fi/mobile
journeys on the confirmed iPhone build before closing any video issue.
