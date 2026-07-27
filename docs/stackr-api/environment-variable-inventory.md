# Stackr Environment Variable Inventory

Audit date: 2026-07-27
Values are intentionally omitted. This document lists variable names, likely consumers and exposure boundaries only.

## Client-Visible Expo Variables

Variables prefixed with `EXPO_PUBLIC_` can be bundled into the mobile/web client and must never contain secrets.

| Variable | Consumer area |
| --- | --- |
| `EXPO_PUBLIC_BETA_TRADE_DEMO_MODE` | App mode/trade demo behavior |
| `EXPO_PUBLIC_CAPTURE_GEOMETRY_V2` | Scanner capture geometry |
| `EXPO_PUBLIC_CARD_LOCALISATION` | Scanner card localisation |
| `EXPO_PUBLIC_CARD_LOCALISATION_SAFETY_MARGIN` | Scanner localisation tuning |
| `EXPO_PUBLIC_CARD_LOCALISATION_SAMPLE_FPS` | Scanner localisation sampling |
| `EXPO_PUBLIC_FETCH_DIAGNOSTICS` | Fetch diagnostics |
| `EXPO_PUBLIC_LEGACY_CLOUD_FALLBACK_ENABLED` | Recognition fallback |
| `EXPO_PUBLIC_LOCAL_RECOGNITION_ENABLED` | Local recognition feature flag |
| `EXPO_PUBLIC_LOCAL_RECOGNITION_SHADOW_MODE` | Local recognition shadow mode |
| `EXPO_PUBLIC_ON_DEVICE_VISUAL` | On-device visual matching |
| `EXPO_PUBLIC_ON_DEVICE_VISUAL_MODEL_PATH` | On-device visual model path |
| `EXPO_PUBLIC_PRICE_API_URL` | Current Railway/backend API base |
| `EXPO_PUBLIC_PRICING_ENGINE_V2_ENABLED` | Pricing V2 client flag |
| `EXPO_PUBLIC_RECOGNITION_FEEDBACK_API_URL` | Recognition feedback API override |
| `EXPO_PUBLIC_RECOGNITION_FEEDBACK_ENABLED` | Recognition feedback flag |
| `EXPO_PUBLIC_SCAN_AUTO_CAPTURE_STABLE_FRAMES` | Scanner auto-capture tuning |
| `EXPO_PUBLIC_SCAN_AUTO_CAPTURE_V2` | Scanner auto-capture feature flag |
| `EXPO_PUBLIC_SCAN_BINDER_PAGE_REMOTE_CONCURRENCY` | Binder scan fallback concurrency |
| `EXPO_PUBLIC_SCAN_BINDER_PAGE_V2` | Binder page scan feature flag |
| `EXPO_PUBLIC_SCAN_LAB_UPLOAD_API_URL` | Scan lab upload API override |
| `EXPO_PUBLIC_SCAN_LOCAL_OCR_MATCHER` | Local OCR matcher flag |
| `EXPO_PUBLIC_SCAN_LOCAL_OCR_STRONG_CONFIDENCE` | Local OCR threshold |
| `EXPO_PUBLIC_SCAN_PROVIDER` | Scanner provider selection |
| `EXPO_PUBLIC_SCAN_QUALITY` | Scanner quality gate |
| `EXPO_PUBLIC_SCAN_QUALITY_DEVICE_PROFILE` | Scanner quality profile |
| `EXPO_PUBLIC_SCAN_QUALITY_DIAGNOSTICS` | Scanner quality diagnostics |
| `EXPO_PUBLIC_SCAN_XIMILAR_FALLBACK` | Ximilar fallback flag |
| `EXPO_PUBLIC_SCANNER_DIAGNOSTICS_ENABLED` | Scanner diagnostics flag |
| `EXPO_PUBLIC_SHADOW_MODE_PILOT_API_URL` | Shadow-mode API override |
| `EXPO_PUBLIC_STACKR_SCAN_LAB_ENABLED` | Scan lab feature flag |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe client provider |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase public/anon client key |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase public project URL |

Findings:

- `eas.json` defines public Expo variables for build profiles. Values are not repeated here.
- `lib/supabase.tsx` contains public Supabase configuration. Values are not repeated here.
- `.env.local` was loaded by lint and exported `EXPO_PUBLIC_PRICE_API_URL`; its value was not inspected or printed.

## Mobile/Expo Build Variables

| Variable | Consumer area |
| --- | --- |
| `APP_VARIANT` | App config variant, development app identity |
| `BETA_TRADE_DEMO_MODE` | Non-public app mode value |
| `EXPO_OS` | Expo/static rendering behavior |
| `PRICE_API_URL` | Legacy/current API URL fallback |

## Backend Server Variables

Server-only unless explicitly public in code or deployment config.

| Variable | Consumer area |
| --- | --- |
| `ADMIN_API_KEY` | Admin/debug protection |
| `ANTHROPIC_API_KEY` | Legacy scan identify/provider route |
| `API_BASE_URL` | Backend/API URL generation |
| `CARDMATRIX_API_KEY` | Grading-quality provider |
| `CARDSIGHTAI_API_KEY` | CardSight fallback |
| `NODE_ENV` | Runtime behavior |
| `PLATFORM_FEE_PERCENT` | Marketplace/payment logic |
| `PORT` | Railway/backend listener |
| `RAILWAY_PUBLIC_DOMAIN` | Backend public URL detection |
| `STACKR_ADMIN_API_KEY` | Admin route protection |
| `STACKR_API_PUBLIC_URL` | Public Stackr API URL |
| `SUPABASE_ANON_KEY` | Backend Supabase public client where needed |
| `SUPABASE_PROJECT_REF` | Supabase project reference |
| `SUPABASE_SECRET_KEY` | Backend privileged Supabase key |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend privileged Supabase key |
| `SUPABASE_URL` | Supabase project URL |

## Provider And Integration Secrets

These must remain backend, CI or Edge Function only.

| Variable | Provider/area |
| --- | --- |
| `DISCORD_BUG_REPORTS_WEBHOOK_URL` | Discord webhook |
| `DISCORD_FEEDBACK_WEBHOOK_URL` | Discord webhook |
| `DISCORD_FIND_TRADE_WEBHOOK_URL` | Discord webhook |
| `DISCORD_REVIEWS_WEBHOOK_URL` | Discord webhook |
| `DISCORD_STACKR_NEWS_BOT_TOKEN` | Discord bot |
| `DISCORD_STACKR_NEWS_CHANNEL_ID` | Discord bot/channel |
| `DISCORD_STACKR_NEWS_GUILD_ID` | Discord guild |
| `EBAY_BROWSE_TOKEN` | eBay Browse token |
| `EBAY_CLIENT_ID` | eBay OAuth |
| `EBAY_CLIENT_SECRET` | eBay OAuth |
| `EBAY_MARKETPLACE_ID` | eBay marketplace |
| `EBAY_OAUTH_SCOPES` | eBay OAuth |
| `EBAY_SOLD_API_KEY` | Authorised sold source |
| `EBAY_SOLD_API_URL` | Authorised sold source |
| `GIBL_API_KEY` | GIBL provider |
| `GIBLTCG_API_KEY` | GIBLTCG provider |
| `GIBLTCG_ENDPOINT` | GIBLTCG provider |
| `OPENAI_API_KEY` | Minty/narrative provider |
| `POKEMON_PRICE_TRACKER_API_KEY` | Price provider |
| `POKEMON_TCG_API_KEY` | Pokemon TCG API |
| `POKETRACE_API_KEY` | PokeTrace provider |
| `POKEWALLET_API_KEY` | PokeWallet provider |
| `SCRYDEX_API_KEY` | ScryDex provider |
| `SCRYDEX_TEAM_ID` | ScryDex provider |
| `SERPAPI_API_KEY` | Search provider |
| `SHIPPO_API_KEY` | Shippo |
| `SHIPPO_API_TOKEN` | Shippo |
| `STRIPE_SECRET_KEY` | Stripe backend |
| `XIMILAR_API_TOKEN` | Ximilar recognition |

## Recognition And Scanner Server Variables

| Variable | Consumer area |
| --- | --- |
| `CLIP_ACCEPT_MARGIN` | CLIP/local AI threshold |
| `CLIP_ACCEPT_SIMILARITY` | CLIP/local AI threshold |
| `CLIP_EMBED_BATCH_SIZE` | CLIP embedding script |
| `CLIP_EMBED_LIMIT` | CLIP embedding script |
| `CLIP_MODEL` | Local AI model |
| `CLIP_WARMUP_ON_BOOT` | Backend warmup |
| `INTERNAL_LOCAL_RECOGNITION_SHADOW_MODE_ENABLED` | Internal shadow-mode flag |
| `LOCAL_RECOGNITION_SHADOW_MODE_ENABLED` | Backend shadow-mode flag |
| `MIN_CARD_IMAGE_HEIGHT` | Image ingestion guard |
| `MIN_CARD_IMAGE_WIDTH` | Image ingestion guard |
| `RARE_CANDY_SCAN_ACCEPT_FINAL_SCORE` | Local visual scan threshold |
| `RARE_CANDY_SCAN_ACCEPT_MARGIN` | Local visual scan threshold |
| `RARE_CANDY_SCAN_ACCEPT_SIMILARITY` | Local visual scan threshold |
| `RARE_CANDY_SCAN_MAX_CANDIDATES` | Local visual scan response |
| `RARE_CANDY_SCAN_MIN_VISUAL_SIMILARITY` | Local visual scan threshold |
| `RARE_CANDY_SCAN_RESPONSE_CANDIDATES` | Local visual scan response |
| `RARE_CANDY_SCAN_RESPONSE_MIN_FINAL_SCORE` | Local visual scan response |
| `RARE_CANDY_SCAN_WARMUP` | Backend warmup |
| `RECOGNITION_FEEDBACK_STORAGE_BUCKET` | Feedback private storage |
| `SCAN_LAB_STORAGE_BUCKET` | Scan lab private storage |
| `SCANNER_PACK_ID` | Scanner pack generation |
| `SCANNER_PACK_LANGUAGE` | Scanner pack generation |
| `SCANNER_PACK_MODEL` | Scanner pack generation |
| `SCANNER_PACK_OUT_DIR` | Scanner pack generation |
| `SCANNER_PACK_ROOT` | Scanner pack hosting/root |
| `STACKR_RECOGNITION_MAX_BATCH_IMAGES` | Edge recognition guard |
| `STACKR_RECOGNITION_MAX_DIMENSION` | Edge recognition guard |
| `STACKR_RECOGNITION_MAX_IMAGE_BYTES` | Edge recognition guard |
| `STACKR_RECOGNITION_MAX_TOTAL_BYTES` | Edge recognition guard |
| `STACKR_RECOGNITION_MIN_DIMENSION` | Edge recognition guard |
| `STACKR_SCAN_LAB_UPLOADS_ENABLED` | Scan lab backend flag |
| `STACKR_XIMILAR_CACHE_MIN_CONFIDENCE` | Ximilar cache threshold |
| `STACKR_XIMILAR_RATE_LIMIT_HOUR` | Ximilar rate limit |
| `STACKR_XIMILAR_RATE_LIMIT_MINUTE` | Ximilar rate limit |
| `STACKR_XIMILAR_TIMEOUT_MS` | Ximilar timeout |

## Pricing And Market Variables

| Variable | Consumer area |
| --- | --- |
| `CHASE_PRICE_FRESHNESS_HOURS` | Price refresh lane |
| `CHASE_PRICE_REFRESH_LIMIT` | Price refresh lane |
| `EBAY_BROWSE_SEARCH_TIMEOUT_MS` | eBay active provider |
| `EBAY_SOLD_SEARCH_TIMEOUT_MS` | eBay sold provider |
| `ENABLE_POKEMONTCG_CARD_PRICE_FALLBACK` | Pricing fallback |
| `ENABLE_TCGCSV_CARD_SYNC` | TCGCSV sync |
| `EUR_TO_GBP` | Currency conversion |
| `HIGH_VALUE_PRICE_FRESHNESS_HOURS` | Price refresh lane |
| `HIGH_VALUE_PRICE_REFRESH_LIMIT` | Price refresh lane |
| `HIGH_VALUE_REFRESH_THRESHOLD_GBP` | Price refresh lane |
| `JPY_TO_GBP` | Currency conversion |
| `MARKET_LISTINGS_PRICE_FRESHNESS_HOURS` | Price refresh lane |
| `MARKET_LISTINGS_PRICE_REFRESH_LIMIT` | Price refresh lane |
| `OWNED_PRICE_FRESHNESS_HOURS` | Price refresh lane |
| `OWNED_PRICE_REFRESH_LIMIT` | Price refresh lane |
| `PRICE_REFRESH_API_TIMEOUT_MS` | Price refresh worker |
| `PRICE_REFRESH_DELAY_MS` | Price refresh worker |
| `PRICING_ENGINE_V2_ENABLED` | Backend Pricing V2 flag |
| `PRICING_V2_BACKFILL_DELAY_MS` | Pricing V2 backfill |
| `PRICING_V2_DISAGREEMENT_THRESHOLD` | Pricing V2 scoring |
| `PRICING_V2_EBAY_ACTIVE_ENABLED` | eBay active adapter |
| `PRICING_V2_EBAY_ACTIVE_LIMIT` | eBay active adapter |
| `PRICING_V2_EBAY_ACTIVE_REFRESH_HOURS` | eBay active adapter |
| `PRICING_V2_EBAY_ACTIVE_TIMEOUT_MS` | eBay active adapter |
| `PRICING_V2_EBAY_ACTIVE_WEIGHT` | eBay active adapter |
| `PRICING_V2_EBAY_SOLD_ENABLED` | eBay sold adapter |
| `PRICING_V2_EBAY_SOLD_REFRESH_HOURS` | eBay sold adapter |
| `PRICING_V2_EBAY_SOLD_WEIGHT` | eBay sold adapter |
| `PRICING_V2_EXISTING_STACKR_ENABLED` | Existing Stackr source |
| `PRICING_V2_EXISTING_STACKR_REFRESH_HOURS` | Existing Stackr source |
| `PRICING_V2_EXISTING_STACKR_WEIGHT` | Existing Stackr source |
| `PRICING_V2_MANUAL_COMP_ENABLED` | Manual comp source |
| `PRICING_V2_MANUAL_COMP_REFRESH_HOURS` | Manual comp source |
| `PRICING_V2_MANUAL_COMP_WEIGHT` | Manual comp source |
| `PRICING_V2_MAX_OBSERVATIONS_PER_SOURCE` | Pricing V2 scoring |
| `PRICING_V2_MIN_MATCH_SCORE` | Pricing V2 scoring |
| `PRICING_V2_REFRESH_DELAY_MS` | Pricing V2 worker |
| `PRICING_V2_STALE_AFTER_HOURS` | Pricing V2 freshness |
| `PRICING_V2_STALE_FALLBACK_DAYS` | Pricing V2 fallback |
| `QUEUED_PRICE_REFRESH_LIMIT` | Price refresh lane |
| `STACKR_DISPLAY_CURRENCY` | Display/pricing |
| `TCGCSV_GROUP_DELAY_MS` | TCGCSV sync |
| `TCGDEX_API_BASE_URL` | TCGdex provider |
| `TCGDEX_CACHE_TTL_MS` | TCGdex cache |
| `TCGDEX_CARD_DETAIL_BATCH_SIZE` | TCGdex sync |
| `TCGDEX_MAX_PAGES` | TCGdex sync |
| `TCGDEX_PAGE_SIZE` | TCGdex sync |
| `TCGDEX_SYNC_BATCH_SIZE` | TCGdex sync |
| `TCGDEX_TIMEOUT_MS` | TCGdex timeout |
| `USD_TO_GBP` | Currency conversion |

## Catalogue/Image Variables

| Variable | Consumer area |
| --- | --- |
| `POKETRACE_API_BASE_URL` | PokeTrace provider |
| `POKETRACE_API_CACHE_TTL_MS` | PokeTrace cache |
| `POKEWALLET_API_BASE_URL` | PokeWallet provider |
| `POKEWALLET_TIMEOUT_MS` | PokeWallet provider |
| `SCRYDEX_API_BASE_URL` | ScryDex provider |
| `SERPAPI_ENGINE` | Search provider |
| `STACKR_CACHE_PROVIDER_IMAGES` | Image cache flag |
| `STACKR_CARD_IMAGE_BUCKET` | Card image bucket |
| `STACKR_JAPANESE_CARD_UNIVERSE_TARGET` | Catalogue target count |
| `STACKR_PILOT_OUT_HARD_NEGATIVES` | Recognition pilot output |
| `STACKR_PILOT_OUT_MANIFEST` | Recognition pilot output |
| `STACKR_PILOT_OUT_REPORT` | Recognition pilot output |
| `STACKR_PILOT_SCAN_LAB_MANIFEST` | Recognition pilot input |

## Community/News Variables

| Variable | Consumer area |
| --- | --- |
| `COMMUNITY_NEWS_MAX_PER_CATEGORY` | News sync |
| `COMMUNITY_NEWS_MAX_TOTAL` | News sync |
| `COMMUNITY_NEWS_RSS_SOURCES` | News sync |
| `COMMUNITY_NEWS_SYNC_MODE` | News sync |
| `SHIPPO_ALLOW_LABEL_PURCHASES` | Shipping/purchase gate |
| `SHIPPO_API_BASE_URL` | Shippo |

## GitHub Actions Variables And Secrets

`.github/workflows/price-refresh.yml` references:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PRICE_API_URL`
- `EXPO_PUBLIC_PRICE_API_URL`
- `POKEMON_TCG_API_KEY`
- `USD_TO_GBP`
- `EUR_TO_GBP`
- `ENABLE_TCGCSV_CARD_SYNC`

Stage 2/CI should add protected environment variables only after the migration plan is approved. Do not put values in workflow files.

## Supabase Edge Function Variables

Local Edge Functions reference:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `XIMILAR_API_TOKEN`
- `STACKR_RECOGNITION_MAX_IMAGE_BYTES`
- `STACKR_RECOGNITION_MAX_BATCH_IMAGES`
- `STACKR_RECOGNITION_MAX_TOTAL_BYTES`
- `STACKR_RECOGNITION_MIN_DIMENSION`
- `STACKR_RECOGNITION_MAX_DIMENSION`
- `STACKR_XIMILAR_TIMEOUT_MS`
- `STACKR_XIMILAR_RATE_LIMIT_MINUTE`
- `STACKR_XIMILAR_RATE_LIMIT_HOUR`
- `STACKR_XIMILAR_CACHE_MIN_CONFIDENCE`
- `EBAY_BROWSE_TOKEN`
- `OPENAI_API_KEY`
- `MINTY_NARRATIVE_MODEL`

Live Supabase `scan-card` also uses `ANTHROPIC_API_KEY` based on function source inspection.

## Boundary Findings

- Public Expo variables include API URLs and public Supabase values. They are not secrets, but they are visible in the client bundle.
- Service-role keys, provider tokens, eBay credentials, Stripe secret, Shippo credentials and AI provider keys must remain backend/CI/Edge only.
- Current config mixes hard-coded public Supabase config with env-driven deployment config.
- Stage 2 should consolidate client configuration behind the Stackr API client and keep privileged access in Railway/Supabase/GitHub protected environments only.
