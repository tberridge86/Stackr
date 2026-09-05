# Private owner recognition

This lane implements the owner's 5 September 2026 approval recorded in
`docs/stackrtcg-ip-operating-boundary.md`. It uses production authentication and
infrastructure, but does not activate recognition for the general app audience.

## What the owner uses

Build with EAS profile `production-owner` (iOS store-signed for private TestFlight
distribution). It uses the existing app identifier and production services, with
channel `owner-recognition` and runtime `1.0.3-owner-recognition-v1`. Do not publish
this lane to the general production update channel or an external testing group.

Open the flask button in Scan, or Settings → Private recognition & my capture
dataset. The server verifies the signed-in account before enabling the scanner.
Photograph a single upright card with four visible corners on a contrasting
background. Edge detection and native perspective correction produce a full-card
JPEG; the authenticated backend passes it transiently to SigLIP FP32. The screen
shows up to five variants for manual review. Similarity is not a probability.
This first lane requires an internet connection: inference is on the private
server, not the unfinished native 128-dimensional model pack.

To collect data, select the correct candidate or leave the result unresolved,
enter a physical-card label, then explicitly save. Reuse that label for additional
photos of the same physical card. Saved images and labels live in an account-scoped
directory on that device and can be individually deleted. Nothing is auto-added
to the collection, automatically uploaded as a dataset, or automatically used for
training. Uninstalling the app may remove local captures. Export/backup and a
protected zero-overlap capture benchmark are subsequent work, not completed features.

## Server configuration

The backend requires:

- `STACKR_OWNER_RECOGNITION_ENABLED=true`
- `STACKR_OWNER_RECOGNITION_USER_IDS`: exactly one verified owner Supabase UUID
- `STACKR_OWNER_RECOGNITION_SERVICE_URL`: private Railway service origin
- `OWNER_SIGLIP_SERVICE_TOKEN`: server-only random shared credential, at least 32 characters
- Existing Supabase URL and an API key for `auth.getUser(accessToken)`

No owner UUID or service credential is read from client-controlled request fields.
Admin roles and editable user metadata do not bypass the owner check. Authentication
precedes image body parsing; the endpoint restricts size/type, concurrency and
timeouts. Only bounded known candidate/diagnostic fields cross back to the app.

`recognition-service/OWNER_SIGLIP.md` documents the exact pinned model, gallery and
service runtime. The packaging helper validates the original file hashes and
creates a new minimal Docker context without credentials or unrelated repo files.
Do not set blocked native manifests to ready: this lane deliberately does not use
them. The rejected INT8 and DINO/SigLIP gates are not selected.

## Verification and rollout

Local checks: TypeScript, lint, owner auth and HTTP route tests, response/dataset
contract tests, photo geometry/cleanup tests, EAS archive dependency closure and
private build/runtime isolation. The real-model reference smoke loads all 48,011
references and verifies known identity plumbing; it is not camera accuracy.

Before reporting the feature live, record the deployed model readiness and exact
backend revision, rejection of unauthenticated/nonowner requests, an authenticated
owner scan, successful native build identifier and private installation route.
Then measure real-device recognition outcomes, fallbacks/retakes, cold/warm latency,
memory, crashes and language/variant regressions. These are not established by unit
tests or the synthetic holdout. Never retune on a consumed holdout.

Rollback: disable `STACKR_OWNER_RECOGNITION_ENABLED` and stop the dedicated private
service. No catalogue/index activation or database migration is needed. Public
production recognition flags and auto-add remain unchanged.
