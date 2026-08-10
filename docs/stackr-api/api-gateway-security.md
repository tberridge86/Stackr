# Stage 11: API Gateway, Authentication and Abuse Protection

## Current State Found

Before Stage 11, Railway exposed the Express `/v1` API directly. The API already emitted request IDs, structured errors, ETags and catalogue cache headers, but the server used open CORS and had no edge route allowlist or shared abuse controls. The private recognition service protected `/metrics`, but its identify, embed and feedback endpoints did not authenticate the calling gateway. No Cloudflare Worker configuration existed in the repository.

A connected read-only check on 2026-07-28 found no entries in the hosted Supabase migration history and no `audit` schema. Stage 11 has not been applied to the hosted project. Its migration is self-contained and must be tested on a local database or disposable Supabase branch before the repository migration history is reconciled with production.

Stage 11 adds a Cloudflare Worker under `gateway/` and keeps Railway as the catalogue/pricing/asset origin. The FastAPI recognition service remains a separate private origin.

```text
Stackr mobile app
  -> https://api.stackrtcg.com/v1
  -> Cloudflare Worker
       -> Railway Stackr backend
       -> private FastAPI recognition service
       -> Durable Object protection state
```

The Worker is an explicit gateway, not an open proxy. Unknown paths, methods, query parameters and payload fields are rejected before an origin call.

## Public Contract

Public cached reads:

- health and readiness, with no internal dependency details;
- catalogue manifest, delta, languages, series, sets, cards and variants;
- catalogue search;
- public aggregate price, price-history, movers and opportunities;
- approved public asset manifest.

Authenticated mutations:

- recognition identify, embed and feedback;
- private scan presign and validated image upload.

Admin-only routes use verified Supabase `app_metadata` roles. User-editable `user_metadata` is never used for authorization. Protected catalogue-ingestion and asset-migration routes are forwarded only after the gateway verifies an admin role, applies the admin/ingestion limit and injects the backend-only admin credential.

## Authentication Boundaries

The Worker verifies Supabase access tokens against the project's JWKS with issuer, audience, expiry, algorithm and authenticated-role checks. A publishable-key Auth server lookup is available only as a compatibility fallback for projects still using legacy symmetric signing. Service-role and secret keys are not used by the Worker or mobile app.

Recognition requests use a dedicated HMAC credential that is different from the Railway origin key. The signature binds:

- service ID;
- Unix timestamp;
- one-time nonce;
- HTTP method and path;
- SHA-256 body digest;
- verified user ID;
- device ID.

The recognition service rejects expired signatures, altered bodies, invalid actors and replayed nonces. Set `STACKR_RECOGNITION_GATEWAY_AUTH_MODE=disabled` only as an explicit rollback; the default is `required`.

Railway has a separate reversible origin-key gate for routes owned by the Worker. Production now defaults to `required`; a missing key fails closed with `503`. Configure the same strong random value as `BACKEND_ORIGIN_KEY` in Cloudflare and `STACKR_GATEWAY_ORIGIN_KEY` in Railway before deploying the backend change. Development defaults to `disabled`, and an explicit production override is reserved for a time-bounded incident rollback.

## Cache Policy

| Route class | Fresh | Stale window | Shared cache |
| --- | ---: | ---: | --- |
| Catalogue/card/set reads | 60 seconds | 300 seconds | Yes |
| Search | 30 seconds | 120 seconds | Yes, stricter rate limit |
| Public aggregate market reads | 60 seconds | 300 seconds | Yes |
| Health/readiness | None | None | No |
| Authenticated or cookie-bearing reads | None | None | No |
| Recognition, uploads and admin | None | None | No |

Cache keys include the current catalogue version held in a Durable Object. A new manifest version changes the namespace automatically. Catalogue activation can also call `POST /v1/admin/catalogue/cache/activate`; old entries become unreachable without requiring a global cache scan.

Content-hash catalogue assets retain the Stage 4 `public, max-age=31536000, immutable` object-storage policy. Private scans, collections, binders, offers, account data and private prices are never placed in the shared gateway cache.

## Abuse Controls

Rate limits use separate account, device and IP dimensions. The first exhausted dimension denies the request, so IP is not the sole identity signal.

| Class | Default per 60 seconds |
| --- | ---: |
| Cached catalogue | 600 |
| Search | 60 |
| Public pricing | 120 |
| Authenticated recognition | 30 |
| Image fallback/upload | 5 |
| Admin reads/actions | 20 |
| Ingestion commands | 5 |

Durable Objects provide atomic fixed-window limits, mutation idempotency and downstream circuit state. Mutation keys are scoped to the verified account and request fingerprint. Reusing a key with a different payload returns `409`; a completed request is replayed without repeating the origin mutation.

JSON recognition bodies are capped and cannot contain base64 image data. Direct image upload is capped at 10 MB and validates JPEG, PNG, WebP or HEIC signatures against the declared MIME type before forwarding.

GET requests receive at most one retry on network failure or `502`, `503` or `504`. Mutations are not retried by the gateway. Five downstream failures open a 30-second circuit. Origin timeouts are shorter for catalogue calls and longer only for image fallback.

## Security and Logging

The Worker applies exact CORS origins per environment and security headers including HSTS, `nosniff`, frame denial, no-referrer and a deny-by-default CSP. Logs contain request ID, route ID, method, status, duration and environment only. Authorization headers, idempotency keys, device IDs, query values, bodies, provider payloads and secrets are not logged.

## Partner API Foundation

Migration `20260728173530_stackr_api_gateway_controls.sql` creates private `audit` tables for:

- partner clients;
- HMAC-SHA256 key fingerprints and prefixes, never raw keys;
- scopes;
- key-to-scope grants;
- hourly usage accounting;
- minimized gateway security events.

`api_access_enabled` defaults to false. The Worker has no partner-key authentication path, so this migration does not expose a partner API.

## Configuration Inventory

Cloudflare non-secret variables:

- `ENVIRONMENT`
- `API_VERSION`
- `ALLOWED_ORIGINS`
- `BACKEND_ORIGIN`
- `RECOGNITION_ORIGIN`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `RECOGNITION_SERVICE_ID`
- `AUTH_TIMEOUT_MS`
- `BACKEND_TIMEOUT_MS`
- `RECOGNITION_TIMEOUT_MS`
- `IMAGE_FALLBACK_TIMEOUT_MS`

Cloudflare secrets:

- `BACKEND_ORIGIN_KEY`
- `BACKEND_ADMIN_KEY`
- `RECOGNITION_SERVICE_SECRET`

Railway backend:

- `STACKR_GATEWAY_ORIGIN_AUTH_MODE`
- `STACKR_GATEWAY_ORIGIN_KEY`

Recognition service:

- `STACKR_RECOGNITION_GATEWAY_AUTH_MODE`
- `STACKR_RECOGNITION_GATEWAY_SERVICE_ID`
- `STACKR_RECOGNITION_GATEWAY_SERVICE_SECRET`
- `STACKR_RECOGNITION_GATEWAY_SIGNATURE_MAX_AGE_SECONDS`

Expo needs only `EXPO_PUBLIC_STACKR_API_URL`, the Supabase publishable configuration and the signed-in user's short-lived session token. No origin, recognition, admin, provider or service-role credential belongs in the bundle.

## Safe Rollout

1. Apply and validate the private partner/audit migration in a local database or disposable Supabase branch.
2. Configure matching backend origin keys while Railway origin auth remains disabled.
3. Configure the recognition HMAC secret in both Cloudflare and the recognition service.
4. Deploy and test the staging Worker with staging-only CORS origins.
5. Deploy the production Worker and attach the `api.stackrtcg.com` custom domain.
6. Set `EXPO_PUBLIC_STACKR_API_URL=https://api.stackrtcg.com`, keep scanner feature flags gated, and publish a tested Expo build.
7. Confirm app traffic reaches the Worker, then require Railway origin authentication.
8. Do not enable partner API access.

No production deployment or database migration was performed in Stage 11.

## Acceptance Criteria

- Unknown routes, methods, query parameters and payload fields do not reach an origin.
- Supabase JWT signature, issuer, audience and expiry are verified for protected routes.
- Admin authorization reads `app_metadata` only.
- Replayed or body-modified recognition service calls are rejected.
- Repeated idempotent mutations do not repeat the origin call.
- Catalogue responses show cache MISS/HIT behavior and honor ETags.
- Authenticated responses and private mutations are `no-store`.
- The sixth image-fallback request in one minute is rate limited by test configuration.
- MIME/signature mismatch is rejected before upload forwarding.
- Worker dry-run build, gateway tests, lint and TypeScript checks pass.

## Rollback

1. Restore the previous Railway deployment while keeping the origin key configured.
2. Use `STACKR_GATEWAY_ORIGIN_AUTH_MODE=disabled` only for a time-bounded incident rollback with compensating access controls and an incident owner.
3. Point `EXPO_PUBLIC_STACKR_API_URL` back to the previous Railway URL only if emergency compatibility requires it.
4. Remove the `api.stackrtcg.com` Worker custom-domain binding or roll back the Worker deployment.
5. Set `STACKR_RECOGNITION_GATEWAY_AUTH_MODE=disabled` only while rolling recognition back to the previous trusted network boundary.
6. Revert the Stage 11 code commit.
7. If the private partner tables were applied and remain unused, run `supabase/manual/rollback_20260728173530_stackr_api_gateway_controls.sql` in an approved maintenance window.

The exact next stage is Stage 12: staged infrastructure deployment, end-to-end gateway verification and controlled mobile cutover. It must begin only after the Supabase migration is validated and Cloudflare/Railway/recognition secrets are configured outside source control.
