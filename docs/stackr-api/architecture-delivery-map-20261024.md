# Stackr architecture delivery map

Owner direction: 24 October 2026. Baseline: PR #437, `df2fe5d6f45e9213b1306763691453659ada84d9`.
This reorganises delivery of the [original platform contract](distributed-architecture-20261023.md).
It specifies the target and the remaining work; it does not certify production deployment.

## One system, explicit owners

| Layer | Responsibility | Retrieval boundary |
| --- | --- | --- |
| GitHub | One source repository, contracts, additive migrations, CI and release receipts | Continue PR #437; reconcile overlapping PR #436 before integration |
| Expo native / Pages web | Render cached canonical data, refresh in bounded pages, show partial/offline states | Shared Stackr API client; no upstream supplier requests during normal catalogue reads |
| Existing Cloudflare gateway | Canonical API entry, authentication forwarding, request validation and safe public caching | Normalise before cache lookup; keep authenticated ownership and signed media out of shared caches |
| Railway API | Modular application services for catalogue, search, ownership, pricing and commerce | Assemble prepared metadata; no scraping, image conversion or full-collection hydration in screen requests |
| Supabase | Canonical printing/variant metadata, ownership, Auth, RLS, provenance, job state | No media bytes in database rows; preserve identity and account boundaries |
| Cloudflare R2 / CDN | Immutable originals and generated renditions for approved public artwork | One public artwork domain; API supplies verified asset/rendition URLs |
| Existing Railway workers / recognition | Bounded ingestion, enrichment, scheduled work and private recognition | Durable leases, retries and receipts; reuse existing services and queues |

“One repository” means GitHub remains the source repository and R2 becomes the
single store for approved public catalogue media. Supabase remains authoritative
for records and relationships. R2 is not a metadata database or an ownership API.
Private scans, feedback and uploads require protected storage/access; never make
them public to achieve storage consolidation.

WebSocket replicas require shared presence/pub-sub or defined routing; HTTP
replication alone does not make trading state safe across instances.

Retain the existing API implementation while separating responsibilities behind
its contracts. The older NestJS/Redis/BullMQ/Typesense blueprint is not a reason
to replace working frameworks or introduce parallel services now. Any such
adoption needs a demonstrated unmet requirement, migration evidence and a
separate reviewed decision. Preserve the existing private recognition service.

## Read and write contracts

Public catalogue reads follow app cache → Stackr API → prepared database
projection. The response carries canonical identities and verified rendition URLs;
image bytes travel directly from the CDN. Detail, search, sets, Pokédex and
binder displays must resolve the same printing, language, edition and finish.

New catalogue pages contain at most 50 rows. Continuation must preserve query,
filters, ordering and catalogue revision, with a unique tie-breaker. Cancellation,
changed filters, expired cursors and partial results are explicit. Never infer
complete coverage from a first page or a successful HTTP status. Keep strict
server enforcement disabled until compatible installed clients are evidenced.

Ownership reads use the authenticated account and server-owned aggregates for
counts, completion and quantities. A collection summary must not download every
owned row and then hydrate every card on the phone. Keep public metadata caches
separate from account-scoped facts; invalidate ownership after confirmed writes,
and discard in-flight results after account changes. Aggregate semantics must
cover duplicate copies, binder overlap, variant, condition, grade and completion
denominators before replacing legacy calculations. Missing valuations stay
explicit, separate from a known zero value.

Ingestion follows approved source → validated immutable R2 upload → authenticated
and public byte verification → atomic metadata publication → actual API image
verification. Preserve source rights and previous assets. A failed upload must
not publish a guessed URL; uncertain database publication requires reconciliation.
External references remain exceptions until rights and bytes permit migration.

## Delivery order and acceptance

| Stage | Concrete work | Completion evidence | Current baseline |
| --- | --- | --- | --- |
| 1. Release map | Pin API, gateway, native/web, database and worker revisions; reconcile PR #436 | Component receipt tied to actual configured routes | Not yet established for this rewrite |
| 2. Shared retrieval | Retain bounded set/delta reads; complete search continuation; stable identity through caches | Missing/duplicate/page-boundary, cancellation and changed-query tests; exact-source CI | Set/delta changes and public probe implemented; search continuation outstanding |
| 3. Public R2 delivery | Activate R2, verify bucket/domain, configure every public writer, deploy compatible readers, migrate bounded batches | Inventory digests, byte/MIME/hash checks, durable rollback receipts, matching API/CDN output | Copier and readers prepared; subscription/destination unverified; zero migrated by this work |
| 4. Ownership projection | Add authenticated aggregate contract and adopt it on summary surfaces | Cross-account tests, semantic parity, bounded query/request count on large collections | Legacy client aggregation remains |
| 5. Worker consolidation | Rehearse existing Railway worker, drain prior scheduler, transfer lease ownership | One scheduler, bounded retries, persisted coverage and failure evidence | Guarded inactive configuration prepared |
| 6. Web/private storage | Validate Pages redirects/CORS and DNS; inventory private binaries separately | Web journeys and signed-access/retention tests; reversible cutovers | Unfinished; no private/public access change authorised by this document |
| 7. App acceptance | Ship compatible client through existing release lane; test affected phone journeys | Correct cards, complete sets, exact artwork, ownership parity, measured timings | Device verification not performed |

Stages 2 and 4 can proceed while R2 billing is unresolved. Stage 3 requires
compatible readers and every retained writer configured before pointer migration.
Stage 5 must stop the previous scheduler before activating the new owner. Do not
couple a backend-only repair to an unrelated native release; do not call a native
change delivered merely because the backend was deployed.

## Concrete next implementation boundaries

- Search owner: backend search in `backend/lib/stackrApiV1.js` returns
  `nextCursor: null` after choosing/truncating the first matching strategy.
  Name candidate scans lack deterministic ordering; translation interleaving
  also affects rank. `lib/stackrApiV1.ts` accepts no search cursor and
  `lib/stackrDomainAdapter.ts` returns a single array.
  `app/(tabs)/search.tsx` requests 120 cards but receives at most 50; its
  load-more path expands local sets, not card continuation.
  Implement ranking-source continuation, generated API types, adapter and UI
  together. Test more than 50 matches, stable variant ties, repeated cursors,
  query/language/set/revision changes, final pages, cancellation and stale results.
  Offsetting the current truncated candidate arrays is not safe.
- Catalogue owner: `lib/cardSearch.ts` still awaits
  `attachLiveTcgdexCardReferences` from `lib/pokemonTcg.ts` for missing
  artwork when enabled. This is an existing exception to background-only
  suppliers. Establish equivalent canonical image delivery before removing
  the fallback; do not silently withdraw currently usable artwork.
- Ownership owner: replace `lib/collectionSummary.ts` full-row hydration with a
  versioned authenticated aggregate after documenting legacy semantics.
  `lib/ownership.ts` currently pages 1,000 rows without an explicit order;
  `collectionSummary.ts` orders binder rows only by nonunique slot order.
  Reducing these constants to 50 alone increases fan-out and does not solve it.
  Require deterministic retrieval, snapshot/revision behaviour, account isolation
  and parity before switching readers; any schema work is additive and reviewed.
- Release owner: use the existing R2 migration runbook and probe, with an
  independently reviewed identity/image cohort. Preserve all source objects.
  Scope any subscription, DNS, scheduler or schema action concretely at cutover.

## Release evidence and rollback

Record implemented, tested, merged, deployed and device-verified separately.
A receipt must name source SHA, artifact/deployment identity, environment,
migration versions, cohort, expected identities, failures, and rollback state.
A source SHA supplied by an operator is not proof of the served revision.

Measure API and CDN separately, plus first useful screen content and device
image rendering. Report sample counts, bytes, request amplification and p50/p95;
record cache state and network/geography. Sub-100ms warm retrieval remains a
target, not a universal promise. Do not invent a completion percentage.

Preserve provider-aware mixed migration reads and old immutable objects.
Rollback stops writers/jobs, restores reviewed prior pointer associations and
compatible code/config, then verifies actual responses. Cursor/aggregate changes
must remain compatible with deployed clients until their rollout is confirmed.

References: [migration runbook](r2-catalogue-migration-20261023.md),
[retrieval acceptance](retrieval-acceptance-20261024.md),
[validation evidence](distributed-architecture-validation-20261023.md).
