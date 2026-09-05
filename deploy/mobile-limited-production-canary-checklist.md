# Stackr limited production mobile canary checklist

This checklist covers a production mobile build and a limited EAS update canary. It does not authorise a store submission, a production deployment, database changes, catalogue mutation, or recognition activation.

## Frozen release source

- [ ] The release commit is reviewed on `main` and contains `f151c5a` (`Repair production price refresh runtime bindings`).
- [ ] The worktree is clean and the release commit SHA is recorded in the review evidence.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test:mobile-runtime-config`, and `npm run mobile:verify-runtime -- --expected-environment=production --expected-app-variant=production --require-explicit --require-safe-release-flags` pass.
- [ ] `https://api.stackrtcg.com/v1/health` and the authenticated mobile API smoke checks pass without using staging credentials or hosts.

## Production mobile environment

The protected EAS `production` environment must provide these exact non-secret values:

- `STACKR_MOBILE_APP_VARIANT=production`
- `STACKR_MOBILE_ENVIRONMENT=production`
- `STACKR_MOBILE_PRICE_API_URL=https://pocketvault-production.up.railway.app`
- `STACKR_MOBILE_API_URL=https://api.stackrtcg.com`
- `STACKR_MOBILE_SUPABASE_URL=https://oakdbbzdqwurpjnoqhmu.supabase.co`
- `EXPO_PUBLIC_BETA_TRADE_DEMO_MODE=true`
- `EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED=false`
- `EXPO_PUBLIC_STACKR_SCAN_LAB_ENABLED=false`
- `EXPO_PUBLIC_SCANNER_DIAGNOSTICS_ENABLED=false`
- `EXPO_PUBLIC_SCAN_QUALITY_DIAGNOSTICS=false`
- `EXPO_PUBLIC_SCAN_XIMILAR_FALLBACK=false`
- `EXPO_PUBLIC_XIMILAR_EMERGENCY_FALLBACK=false`
- `EXPO_PUBLIC_STACKR_API_ENABLED=true`
- `EXPO_PUBLIC_IMAGE_FALLBACK_ENABLED=true`
- `EXPO_PUBLIC_STACKR_RECOGNITION_PRIMARY=false`
- `EXPO_PUBLIC_ON_DEVICE_EMBEDDING_ENABLED=false`
- `EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED=false`
- `EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE=false`

The protected environment must also provide `STACKR_MOBILE_SUPABASE_PUBLISHABLE_KEY` as the reviewed production publishable key. It must never contain a Supabase secret/service-role key. Do not add a recognition URL, recognition secret, model version, or index version to the mobile environment until the recognition release lane supplies approved evidence.

The protected GitHub `production` environment must map `STACKR_BACKEND_URL=https://pocketvault-production.up.railway.app`, `STACKR_GATEWAY_URL=https://api.stackrtcg.com`, and `STACKR_SUPABASE_URL=https://oakdbbzdqwurpjnoqhmu.supabase.co`. Its `STACKR_SUPABASE_PUBLISHABLE_KEY` secret must be the same reviewed production publishable key.

## Build credentials and reviewer inputs

- [ ] GitHub environment secret `EXPO_TOKEN` exists and belongs to an Expo account with access to EAS project `22048198-a309-41d2-a2bf-aa354c76be3a`.
- [ ] The GitHub `production` environment has at least one required reviewer protection rule, and an authorised reviewer other than the workflow initiator approves the exact commit.
- [ ] Both iOS and Android production builds are `FINISHED`, use build profile/channel `production`, have runtime version `1.0.3`, and are bound to the exact release commit SHA.
- [ ] Apple signing and Google Play credentials are available to EAS, but no submit command is run in this lane.

## 393 × 852 device-preview smoke

- [ ] The wrapper reports `Production`, viewport `393 × 852`, and Fast Refresh is active.
- [ ] A reviewer enters the production test account credentials; credentials are not pasted into logs, source, or review comments.
- [ ] Login succeeds and the profile belongs to the production test account.
- [ ] Home loads the collection total and a price-history range from `api.stackrtcg.com` without a staging request.
- [ ] Collection loads binders, owned quantities, and stored/live prices; missing evidence remains clearly unavailable rather than fabricated.
- [ ] Search and card detail load canonical data and approved image fallback through the production Stackr API.
- [ ] Server recognition, on-device embeddings, local recognition, and recognition shadow mode remain off. Scan must not claim an automatic server-recognition result.
- [ ] Logout returns to the production login screen and a second login restores the same account.

## Limited canary review

- [ ] Run `Publish Stackr Mobile Production Canary` only from the reviewed commit after it reaches `main`; do not use `Deploy Stackr Production Canary` for this mobile-only lane.
- [ ] Workflow input `confirmation` is exactly `PUBLISH MOBILE CANARY`.
- [ ] `canary_percent=5` and `monitor_minutes=15` for the initial cohort.
- [ ] The workflow has no migration, catalogue, Railway, gateway, model, index, or store-submission inputs and must not invoke those release paths.
- [ ] A reviewer records the EAS update group, platforms, runtime, commit SHA, and five-percent rollout evidence.

## Hold and rollback

- [ ] Hold the canary on any login, price-history, collection, image, crash, or cross-environment error.
- [ ] Do not promote beyond five percent until the 15-minute observation window and reviewer smoke pass.
- [ ] If the canary fails, use the workflow's attested EAS rollout-revert step and record the update group ID and reason.
- [ ] Store submission remains a separate, explicitly approved action.
