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

## Verified production activation (5 September 2026)

The owner-only backend is deployed at commit
`b852318c4331d99996088cb2ee8982246890fbff`, Railway deployment
`7c390364-331c-4a94-bcd6-031cd0e8cebe`. GitHub production run
[`33987712075`](https://github.com/tberridge86/Stackr/actions/runs/33987712075)
passed, including the existing backend and gateway pricing smoke checks. Its
attested previous backend deployment is `54b02356-39ab-4993-973b-64b056fb6e4e`.

The separate, private-only model service is deployment
`930b12b2-1a3e-4b0b-a01a-a79d95c6ad6f`. Readiness validates the pinned FP32 model,
768-dimensional gallery and all 48,011 reference rows. An actual temporary owner
session successfully called both status and identify through the public backend;
unauthenticated and invalid-token calls were rejected. The reference smoke is an
identity-plumbing check, not a measurement of real-card camera accuracy. Temporary
verification sessions were revoked without signing out the owner's other sessions.
See `deploy/evidence/owner-siglip-railway-smoke-2026-09-05.json` for measured evidence.

The private iOS submission profile is `production-owner`, pinned to App Store
Connect app `6772118450` and the internal `Team (Expo)` group. Before submission,
verify that this group still contains only the owner. Do not assign the owner
build to the external beta group, request external beta review, or use a public
TestFlight link. Submit an explicitly verified build ID, never an unqualified
latest build. Successful server activation does not mean a native build has
finished or that a phone has been tested.

The first owner build, iOS 24 (`6d481164-33ef-4d42-ac00-1cc23f74895f`), passed the
previously failing Metro bundle stage but was superseded before distribution.
Final review found that the native rectifier used a screen-scaled renderer while
reporting pixel dimensions. The follow-up explicitly sets renderer scale to one
for full-card and derivative outputs. This requires a new native binary, not an
OTA-only update. The static regression check guards the source contract; it is
not a claim that a 3× iPhone has been exercised. Apple's documented default is the
[main screen's scale](https://developer.apple.com/documentation/uikit/uigraphicsimagerendererformat/scale).

## First installation check

1. Install the specifically identified owner build from the owner's internal
   TestFlight account. Sign in with the existing owner Stackr account.
2. Open **Settings → Private recognition & my capture dataset** (or the flask
   button in Scan). Wait for **Ready · SigLIP FP32 · private server processing**.
3. Photograph one upright card, with all four corners visible against a plain,
   contrasting background. A retake diagnostic must not silently accept a match.
4. Review the candidate's language, set, number and variant. Select the correct
   candidate only when those identifiers agree; otherwise leave it unresolved.
5. Enter a stable label for that physical card and save one capture. Leave and
   reopen the screen to check persistence. Delete a disposable capture to check
   the deletion control. No collection item should be created by either action.

Record failures and successful scans alike, including retakes, language/variant,
device/OS, response time and crashes. Do not label model output as ground truth
without checking the physical card. Keep multiple photographs of the same card
together when later assigning protected benchmark groups; these first captures
do not retrospectively become a zero-overlap holdout.
