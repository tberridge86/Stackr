# Japanese image continuity and lighter surfaces — 10 September 2026

The owner reports that Japanese images previously visible in Stackr no longer load and that the proposed charcoal treatment feels too dark. This continuation checks retained source coverage and changes the client read path and colours. It does not identify the installed build 34 source or establish an iPhone image-load result.

## Current source continuity

Read-only production queries found the following Japanese card-image asset records satisfying the current manifest's publication, visibility, permission, rights, retention, deletion and storage conditions. These are asset records, not unique cards or percentages of the Japanese catalogue.

| Source | Active | Eligible image asset records | Delivery |
| --- | --- | ---: | --- |
| TCGdex | Yes | 3,882 | Existing Supabase copies |
| Official Pokémon Japan | Yes | 3,908 | Existing external references |
| PokeData Japanese | Yes | 129 | Existing external references |

The legacy `public.tcg_cards` table retains 2,294 distinct Japanese image references. Comparing source image bases, with only the high/low rendition suffix removed, matched **2,294 of 2,294** to currently manifest-eligible assets. No unmatched legacy reference was found. This establishes retention of that specific historical population; it does not prove every image renders on a phone or establish parity for every historical third-party service.

Representative current delivery checks:

| Source | Canonical printing | Verified result |
| --- | --- | --- |
| Stored TCGdex | `37ec336a-b646-4981-bd26-7384bba646c0` — Japanese S12a 113 | API returns the stored original and derivatives; original JPEG and grid WebP return HTTP 200 with image MIME types. |
| Official Pokémon Japan | `0b5c44c0-5d8e-43c6-90b8-592b4bd63d86` — Japanese SM8a 050 | API returns the official source URL; source responds HTTP 200, image/jpeg. |
| PokeData Japanese | `f0d924d0-7828-4b68-b838-4e4037cbe469` — Japanese M3 022 | API returns the PokeData source URL; source responds HTTP 200, image/webp. |

The compatibility backend's current Japanese S12a set response contains 258 card records and 254 controlled TCGdex image descriptors. The exact S12a/113 low reference responds HTTP 200, image/webp. The four records without descriptors are not assigned invented URLs. Compatibility `/api/foreign/...` calls belong on the configured price-backend origin; the v1-only gateway rejects that path, while the app's production configuration uses the separate backend correctly.

One gateway request for 250 S12a variants returned 202 grouped printing objects, 190 with an embedded image, and a next cursor. That is an incomplete page of a variant-paginated response, not a set-wide image coverage denominator. Network timings measured through this workspace's proxy are not device latency measurements.

## Client repair

The preferred card read previously included both mandatory card pages and optional asset/set-detail enrichment inside its seven-second deadline. Optional work could therefore abort and discard a populated result, including images already embedded in it, and switch to legacy data. Legacy Japanese provider pointers require the existing live-reference revalidation before display, so this switch is not an equivalent image-delivery path.

The preferred deadline now ends when the complete card facts arrive. Optional artwork and set details run afterwards with their existing independent two-second deadlines. Array identity ties enrichment to the selected canonical result; an aborted or late preferred read cannot overwrite a legacy result. Language, variant, saved ownership and source controls are unchanged. Mandatory card reads can still fail or exceed their deadline; this patch is not a complete network-latency remedy.

Regression tests exercise the actual adapter with shortened real deadlines. Stored, official-Japanese and PokeData URLs survive stalled optional metadata, and a missing embedded image can be enriched after the preferred facts deadline without losing the selected card list. The tests perform no provider network requests.

## Colour revision

The charcoal proposal is superseded by the following light treatment. The large binder feature panel changes along with its text and progress colours; this is not just a different dark hex value.

| Role | Colour |
| --- | --- |
| Page background | `#FAF9FC` |
| Card surface | `#FFFFFF` |
| Inner surface | `#F2EFF7` |
| Binder feature panel / border | `#F0EAFC` / `#DACDF0` |
| Feature text | `#4B346B` |
| Main text | `#433650` |
| Actions and selected navigation | `#6938F5` |

Gold remains an accent elsewhere. The light feature panel uses purple labels and progress fill because the former bright-gold treatment loses definition on a pale background. Teal positive states and the consistent navigation SVGs remain in place.

Calculated contrast ratios: main text/white 11.16:1; secondary text/inner surface 5.08:1; feature text/lilac 8.93:1; its 80%-opacity secondary text/lilac 5.26:1; white/purple actions 6.03:1. These checks assess readability, not aesthetic or device sign-off.

## Verification and limits

App typecheck, API integration, actual-adapter set identity/image deadline cases, Home collector components, foreign binder fallback and optional enrichment checks pass locally. Changed files lint with zero errors and four pre-existing array-style warnings. The available browser has no reachable current app preview; no new native screenshot or visual QA pass is claimed.

No database, source registry, asset object, stored card, ownership record or source permission was changed. The continuation is source work in draft PR #168 and requires release before it can affect the installed app. Pricing coverage, other missing artwork, marketplace demand/Market Movers and installed-build provenance remain outside the verified result.
