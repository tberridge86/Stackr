# Build 27 combined release — live

Released from the existing tberridge86/Stackr repository through [PR 144](https://github.com/tberridge86/Stackr/pull/144). Source: e3c9b00cb668671c5ac74e1c3f05934b1de9240f.

The production backend and iOS update are live. Expo's update endpoint serves update 01a07d7e-b0da-7080-bae8-0f02bfac530d for owner-recognition / 1.0.3-owner-recognition-v1, with the exact verified bundle and production service connections. Native version remains 1.0.3 (27); earlier compatible owner-runtime binaries may receive the same update.

Includes the reviewed UI, compact camera guidance, binder saved-card fallback, all 81 magazine covers, existing production catalogue/art/set-logo connections, private recognition and canonical teaching corrections for language, set, number and finish. Explicit contribution retains the photograph, correction and original predictions in the private review queue.

Validation: every PR/main CI check passed; protected backend deployment 34157978091 succeeded; 36/36 public checks passed; owner model/reference-art recognition and private price/history reads passed; temporary teaching-photo upload, corrected-identity readback and deletion passed, with the canary photo removed. The iOS export includes 552 unique assets and all 81 cover hashes; the served launch-bundle hash matches.

Automatic price refresh and manual queue activation remain disabled. Available prices are source-labelled stored estimates, with freshness shown honestly. Contributions require review before training. Existing database, storage, model and staging boundaries remain unchanged by this release. Physical-camera accuracy and successful update receipt on the owner's phone still require device testing.

Install 1.0.3 (27) in TestFlight, open Stackr online, allow the update to download, then close and reopen it. Open Scan's flask button, photograph a card, use Teach/Correct, and select language, set, collector number and finish. Use the explicit teaching upload action to contribute the example.

Detailed receipt: deploy/evidence/owner-combined-build27-20260907.json.
