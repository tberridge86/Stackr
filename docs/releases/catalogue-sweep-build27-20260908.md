# Build 27 catalogue presentation and loading sweep

This change builds on main `7ee2fa2f6491be54717c4f6e5f6415bf49270cb2` in `tberridge86/Stackr` and integrates the previously unpublished Home/account repair from PR #148 (`52175ac`). It retains the existing production API, native owner-recognition runtime, private teaching flow and magazine cover bundle. It does not replace the catalogue with a new import.

## User-visible changes

- Japanese, Simplified Chinese and Traditional Chinese cards retain their native artwork, language and exact catalogue identity. Set/card labels use the existing English translation resources. Missing translations display an English “translation pending” label; native rules and artist text are not substituted into the English interface.
- Set and binder finish choices come from published canonical variants, including named stamps and Poké Ball/Master Ball patterns. Existing saved quantity keys remain compatible; showing a finish does not assert that its artwork or price exists.
- Set detail loads its exact set and cards before optional logos and ownership enrichment. Opening a card no longer searches every set first. Home loads paginated saved ownership first and enriches only the displayed binder in the background, showing an honest partial subtotal as stored prices arrive. Collection state rejects late responses from another account. Shared global search includes Simplified Chinese and isolates language failures; shared back/long-press haptics are retained from the earlier repair.
- Pricing reads preserve known canonical card IDs and separate caches by signed-in account. A private owner-only provider refresh requests one proven TCGdex normal-card identity, with near-mint/GBP scope, provider timestamps, bounded requests and cooldown. Unsupported finishes, missing provider identities and provider outages remain unavailable. These are estimates, not verified sales.
- Settings shows the installed update reference and offers an explicit update check, download and restart.

## Full inventory audit

The read-only audit covered 751 current-version set membership records, including empty/incomplete entries; this is not a claim that 751 complete sets appear in the public browser.

| Language | Set records | Sets with published cards | English set titles resolved |
| --- | ---: | ---: | ---: |
| English | 223 | 215 | 223 |
| Japanese | 163 | 115 | 161 |
| Simplified Chinese | 185 | 137 | 177 |
| Traditional Chinese | 83 | 83 | 83 |
| Korean | 97 | 3 | 2 |

Existing bundled visuals supplement sparse database logo/symbol records. Neither a title translation nor a bundled set visual establishes complete card-image coverage. English card-name and rules translations still have gaps, particularly recent Japanese cards. Separate asset recovery evidence records actual inserted images and unresolved identity/source conflicts.

## Validation and release limits

Release checks cover TypeScript, lint, catalogue identity/language boundaries, English presentation, canonical finish keys, binder loading, collection pricing, owner teaching, exact provider identity/finish rejection, concurrent refreshes and anonymous pricing privacy. The gateway workflow requires the reviewed current rollback target and independently attests the live deployment before changing traffic.

The release sequence is backend, gateway, then an iOS update for `1.0.3-owner-recognition-v1` on `owner-recognition`. The export must include all 81 magazine covers and production endpoints. Publishing does not prove that an iPhone has downloaded or launched the update: its Settings reference must match the served update.

The one required database preparation, `service_only_tcgdex_variant_aliases`, was applied and verified in staging (`20260908194232`) and production (`20260908194309`) through the migration service, which assigns each execution its timestamp. The checked-in filename matches production. Both return the same Prismatic normal-card aliases, reject a wrong language, deny execution to anonymous/authenticated roles, and allow only `service_role`. The private `catalog` and `ingest` schemas remain unexposed. Do not replay this function preparation or run a broad migration push as part of the backend deployment.

Device startup/scroll/camera performance requires iPhone testing. Missing card art, unsupported prices and unfinished translations are not declared complete. Owner corrections are captured for teaching; this release does not retrain or promote a recognition model. Commerce/payment fulfilment remains disabled.
