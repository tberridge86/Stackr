# TestFlight candidate integration — 28 October 2026

This receipt accompanies the Coming soon additions to PR #446. The owner authorized
continuing the next standard production build. Production Supabase is
`oakdbbzdqwurpjnoqhmu`; the intended audience is Team (Expo).

## Source scope

Base candidate: `ccbdd9d233737d0ed8d6cf5ae97754ccff1a2894`, tree
`33e4122c54447acb734a6bb52d80c342e4e9a019`, which already incorporates main
`8d368bcf68aff40fd358640889898120563f5124`.

Discover adds informational announcements for Delta Reign (en) and Gem Pack Vol.7
(zh-cn), with Coming soon labels before their recorded release date and Checklist
pending afterward until a matching canonical ID and language is published.
Announcements support language and native-language search, contain no invented card
counts or artwork, and do not navigate into an unpublished checklist or binder.
Storm's existing published set remains unchanged. Existing future published sets
receive a Coming soon label. No dependency, workflow, database or service change.

Official announcement sources:
- https://www.pokemon.cn/tcg/24281.html
- https://www.pokemon.com/uk/news/pokemon-tcg-mega-evolution-delta-reign-product-showcase

## Validation and independent review

All following local checks completed successfully on the exact file contents below:
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0; eight existing warnings outside these changes, zero errors.
- `node --import tsx scripts/test-upcoming-pokemon-sets.ts`: exit 0.
- `node --import tsx scripts/test-explore-discover-runtime.ts`: exit 0.
- `node --import tsx scripts/test-issue304-cold-retrieval.ts`: exit 0.

Independent reviewer `final_candidate_review` compared the existing files with the
connected GitHub base and reviewed the new helper and test: GO for integration into
draft PR #446, no blocking findings. This is source review, not live or phone acceptance.
The test uses a typed helper for named host mocks; runtime equality assertions remain
unchanged. The existing synthetic card-holo fixture was restored from the base for
local validation; it is not part of this commit.

| Path | SHA256 |
| --- | --- |
| `app/(tabs)/explore.tsx` | `e4d1fed8af9ece7b2e203477d6b2ab4967d5c9492cfca8dd26b90d5f0da9d09f` |
| `lib/upcomingPokemonSets.ts` | `1468b8bb7892a1907aed26500e6adc23db80840843ec0e94fc8d207c41b988ae` |
| `scripts/test-upcoming-pokemon-sets.ts` | `3aeb3062b73d7dd68d4d61913e442dd01f86282f1f34ff57a05af16a39f6235c` |
| `scripts/test-explore-discover-runtime.ts` | `ffe491cc862923c5ea9640d144070863f1b4aead78be502028be351792b1a7fc` |
| `package.json` | `06b1dabf5a5d598cb30079d69bba6869582f1e5d2b9f09c3f1faded6fbda78a4` |

Hosted CI on the new source revision must be checked separately; prior-head CI does
not certify this integration.

## Fresh release state and next gates

At 2026-10-28 07:34:59.533218 UTC the production oak read-only query still returned
NULL for `api.catalogue_search_identity_page_v1(jsonb,jsonb,integer,text,jsonb)`.
Railway production API `pocketvault` remains SUCCESS at deployment
`dfc23b30-9675-4ba0-ad2b-9f1875302747`, with no staged changes.

Designated-account QA and current gateway version/traffic/Durable Object rollback
identity remain unverified. Establish these gates before the pinned search SQL,
compatible backend and gateway rollout, and dependent client release.
The latest inspected native workflow remains the failed run 40286973319 using
baseline source b5d643a997041db2a8c42b5b6cb0180e8ddf28e7; rerunning it omits these fixes.

The connected GitHub tools provide reads, source changes and reruns but no fresh
workflow dispatch. No authenticated GitHub/EAS/Cloudflare CLI or connected EAS/App
Store/browser execution tool is available in this session. Use the existing owner
execution path once the gates pass; do not add another release workflow.

Required native inputs: exact accepted merged main SHA, exact deployed backend SHA,
`verify_only=false`, and explicitly `build_profile=production` (the workflow default
is production-owner). Submission is separate and must target the exact finished
new EAS build through submit profile production and Team (Expo).

Last attested distributed baseline remains 1.0.6 (61), EAS
`c0acb3f0-8366-48cf-b55c-99b30a2b7469`, source
`b5d643a997041db2a8c42b5b6cb0180e8ddf28e7`.
This integration does not claim a native build, submission, tester availability or
installed-phone acceptance. No production database/service mutation was performed.

[Authoritative continuation](https://github.com/tberridge86/Stackr/blob/codex/infrastructure-priorities-evidence-20261026/docs/releases/testflight-continuation-20261027.md).
