# Stackr 1.0.6 (54) verified delivery

Recorded 2026-10-08T18:59:48.878Z. Build 54 was uploaded successfully and Apple processing is VALID. The build is available to the existing internal Team (Expo) group. The existing external group is assigned, with Apple external state `WAITING_FOR_BETA_REVIEW` and beta review state `WAITING_FOR_REVIEW`; external availability is not yet confirmed.

## Exact release identities

- Frozen native source: `bf3d7a233aa7d30dda99b61ccd51533ae85eed90`, incorporating [PR 319](https://github.com/tberridge86/Stackr/pull/319) and [PR 320](https://github.com/tberridge86/Stackr/pull/320). [Final source CI](https://github.com/tberridge86/Stackr/actions/runs/37823332810) passed.
- [EAS build](https://expo.dev/accounts/tommo86/projects/Stackr/builds/d8c14ae8-bb89-4ec3-b8c0-e41f6f6f3d6e): `d8c14ae8-bb89-4ec3-b8c0-e41f6f6f3d6e`, FINISHED at 2026-10-08T18:42:18.454Z.
- [EAS submission](https://expo.dev/accounts/tommo86/projects/Stackr/submissions/8d1a3b16-73e5-4f37-a552-35b0975836cf): `8d1a3b16-73e5-4f37-a552-35b0975836cf`, FINISHED; created 2026-10-08T18:43:45.079Z.
- Apple build: `37721fe6-96b2-464e-95e4-34b5ee5f6286`; app `6772118450`; bundle `com.tommo86.Stackr`; version/build `1.0.6 (54)`; processing `VALID`, internal `IN_BETA_TESTING`, external `WAITING_FOR_BETA_REVIEW`.
- Existing external group: `Stackr Beta Testers` (`23f56283-e7db-482c-a243-d0179c8fbae7`) assigned. Testing notes match the saved en-US text. [Existing TestFlight link](https://testflight.apple.com/join/qDmymuVm).

## Package and production verification

The downloaded IPA is 363681620 bytes, SHA-256 `afa21cf2df214d10e53657d7bae7a59750cad55f8aed4439472a082b983385c6`. Its packaged bundle version/build, production update channel and runtime `1.0.6` match the release. The approved startup video occurs once with its exact reviewed byte hash. This establishes packaged contents, not installed-device acceptance.

The backend and gateway trees in the frozen native source match deployed service source `92e444124a2cedc9647444a2656ff5d8f9343ce8`. [Backend deployment](https://github.com/tberridge86/Stackr/actions/runs/37820015514) `b594fd37-3c01-4642-a516-cf5c038d8442` and [gateway deployment](https://github.com/tberridge86/Stackr/actions/runs/37821003494) `156a0dfa-d273-4a8e-a81b-87e95097d06e` passed their live checks. Gateway version `072eeb72-fb64-422c-a0ba-e97f54dbbf95` serves 100%; existing secrets and state bindings are preserved. Public health, search/sets, species cards, pagination, bounded artwork and validation/privacy checks passed.

Retained rollback: backend `e985732a-4ebe-4281-8811-963a61276a58`, gateway version `8ca498c6-a03f-4b2d-a55a-d9fcbd4c6d33`. The unrelated provider-key patch remains staged. No price refresh, catalogue/schema write, recognition activation or replacement schedule was run.

The first EAS upload failed before creating a build job. Absence of build 54 was verified before restoring the counter and retrying with the repository-pinned CLI; this delivered exactly build 54. The iOS archive completed successfully. Native Expo Doctor passed 17/18 checks and recommended four newer patch versions; the reviewed locked Expo/React Native dependencies were retained.

## Remaining acceptance

Actual iPhone cold/warm launch, search, set/card loading, ownership/account changes, image recovery and accessibility remain to be tested. Universal instant loading and full-catalogue price coverage are unverified. Provisional estimates are not provider market or completed-sale evidence. Rights-authorised HD artwork and English gaps remain. See [catalogue follow-ups](testflight54-catalogue-followups-20261008.md).
