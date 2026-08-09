# Stackr API v1 Catalogue and Search

Audit date: 2026-07-28
Stage: 5

## Purpose

Stackr API v1 creates a stable `/v1` catalogue contract so the mobile app can stop depending on Supabase table names and provider-specific response shapes for catalogue reads, delta sync and search.

This stage does not remove existing Supabase clients, pricing routes, scanner routes or Ximilar fallback behaviour. It adds a backend API layer over the canonical catalogue projections created in earlier stages.

## Runtime Placement

```text
Stackr mobile application
-> Stackr API client
-> api.stackrtcg.com edge gateway
-> /v1 backend routes
-> api-safe catalogue projections
-> Supabase Postgres
```

The backend route reads public-safe `api.*` catalogue views and uses backend-only Supabase credentials. Service-role or secret keys must remain in Railway/backend environments only.

## Public Contract

The v1 contract is documented in:

```text
docs/stackr-api/openapi.v1.yaml
```

Implemented routes:

```text
GET /v1/health
GET /v1/ready
GET /v1/catalog/manifest
GET /v1/catalog/delta
GET /v1/languages
GET /v1/series
GET /v1/sets
GET /v1/sets/{setId}
GET /v1/sets/{setId}/cards
GET /v1/cards/{cardId}
GET /v1/cards/{cardId}/variants
GET /v1/search
```

Each JSON response uses:

```json
{
  "data": {},
  "meta": {
    "requestId": "request-id",
    "apiVersion": "1",
    "generatedAt": "2026-07-28T00:00:00.000Z",
    "pagination": {
      "limit": 50,
      "nextCursor": null
    }
  }
}
```

Errors use:

```json
{
  "error": {
    "code": "invalid_search_query",
    "message": "Search query must contain at least two characters.",
    "requestId": "request-id"
  },
  "meta": {
    "apiVersion": "1",
    "generatedAt": "2026-07-28T00:00:00.000Z"
  }
}
```

## Manifest

`GET /v1/catalog/manifest` returns:

- current catalogue version;
- catalogue version ID when available;
- minimum compatible app schema version;
- latest change sequence;
- language shards;
- asset base URL;
- model/index version;
- generated timestamp;
- ETag.

The endpoint supports `If-None-Match` and returns `304` when the manifest ETag matches.

## Delta Sync

`GET /v1/catalog/delta` accepts:

- `since`: last applied change sequence;
- `cursor`: opaque cursor from the prior response;
- `limit`: page size.

The route returns inserts, updates and deprecations from `api.catalogue_delta_changes` and never uses large offset pagination.

## Search Priority

`GET /v1/search` runs strategies in this order and stops on the first non-empty result set:

1. exact canonical ID;
2. exact external ID;
3. exact set code and collector number;
4. exact collector number, optionally within `setId`;
5. exact card name within a parsed set-code query;
6. normalised native or English card name;
7. aliases, translated names and transliterations;
8. fuzzy text fallback.

Every result includes a reason:

```text
exact_canonical_id
exact_external_id
exact_set_code_collector_number
exact_collector_number
exact_collector_number_in_set
exact_name_in_set
exact_name
exact_alias
exact_translated_name
fuzzy_name
```

The API does not expose unexplained provider relevance scores.

## Mobile Client

The generated TypeScript client is:

```text
lib/stackrApiV1.ts
```

It defaults to `EXPO_PUBLIC_PRICE_API_URL` through the existing `PRICE_API_URL` config and appends `/v1`. This preserves current deployment configuration while giving the mobile app a stable catalogue/search interface.

## Caching

Catalogue responses are cacheable and include:

- `Cache-Control`;
- `ETag`;
- `Vary: Accept-Encoding, If-None-Match`;
- `X-Request-Id`;
- `X-Stackr-Api-Version`.

Health, readiness and errors are returned with `no-store`. This stage adds no user-specific catalogue endpoints, and no private collection, binder, offer or private pricing responses are globally cached.

The backend mounts the route with HTTP compression middleware. The runtime may provide gzip or Brotli depending on the client `Accept-Encoding` header and deployment environment.

## Acceptance Criteria

- All requested `/v1` catalogue and search routes are mounted.
- OpenAPI 3.1 contract exists and includes all routes.
- TypeScript client exists for the mobile app.
- Responses include request IDs, API version headers and structured envelopes.
- Cursor pagination is used for list and delta responses.
- Manifest supports ETags and `If-None-Match`.
- Search returns explicit reason values and covers English, Japanese, Simplified Chinese, Traditional Chinese and Korean fixture cases.
- No new Supabase migration or production schema change is required for this stage.

## Rollback

Rollback is code-only:

1. remove the `/v1` router mount from `backend/server.js`;
2. remove `backend/routes/v1.js`;
3. remove `backend/lib/stackrApiV1.js`;
4. remove `lib/stackrApiV1.ts`;
5. remove `docs/stackr-api/openapi.v1.yaml`;
6. remove the Stage 5 scripts from `package.json`.

No database rollback is required because this stage adds no migrations.

## Remaining Gaps

- The mobile UI still needs a controlled feature-flagged migration from direct catalogue/Supabase reads to `StackrApiV1Client`.
- Production readiness depends on Railway having backend-only Supabase credentials configured.
- Live integration against the remote Supabase project should be run in a protected environment after Stage 5 is merged.
- Search quality beyond deterministic fixture coverage depends on the real canonical catalogue population and Stage 6 benchmarking.
