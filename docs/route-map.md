# StackR Route Map

This map separates the routes users should actively land on from compatibility shims kept for old links, notifications, and Expo deep links. Do not delete a shim until all in-app links, notifications, Supabase redirects, and external deep links have been checked.

## Active Routes

| Area | Current route | Notes |
| --- | --- | --- |
| App entry | `/` | Auth/profile gate. Sends signed-in users to `/(tabs)`. |
| Home | `/(tabs)` | Main collector hub. |
| Collection Vault | `/(tabs)/binder` | Active collection tab. |
| Binder detail | `/binder/[id]` | Active binder detail route. |
| Binder create | `/binder/new` | Active binder creation flow. |
| Add binder cards | `/binder/add-cards` | Active add-cards flow. |
| Scan | `/scan` | Active scanner route. |
| Scan result | `/scan/result` | Active scan confirmation/results route. |
| Scan diagnostics | `/scan/diagnostics` | Active diagnostic route. |
| Card camera | `/scan/card-camera` | Active camera implementation route. |
| Market | `/(tabs)/market` | Active marketplace route. |
| Listing create | `/listing/new` | Active create-listing flow. |
| Offers list | `/offers` | Active offers inbox/outbox route. |
| Offer build | `/offer/new` | Active offer creation route. |
| Offer detail | `/offer/[id]` and `/offer` | Active negotiation/detail routes. |
| Offer review | `/offer/review` | Active review flow. |
| Orders | `/orders` and `/seller/orders` | Active order routes. |
| Watchlist | `/watchlist` | Active favorited-listings route. |
| Search | `/(tabs)/search` | Active search tab. |
| Community | `/(tabs)/community` | Active community tab. |
| Community profile | `/community/profile/[userId]` | Active public profile route. |
| Card detail | `/card/[id]` | Active card detail route. |
| Set detail | `/set/[id]` | Active set detail route. |
| Product detail | `/product/[id]` | Active sealed/product detail route. |
| Pokemon detail | `/pokemon/[id]` | Active Pokedex detail route. |
| Prices | `/prices` | Active price tools route. |
| Price Builder | `/price-builder` | Active price-builder route. |
| Value History | `/value-history` | Active value history route. |
| Duplicates | `/duplicates` | Active duplicates route. |
| Profile | `/(tabs)/profile` | Active profile tab. |
| Profile setup | `/profile/setup` | Active first-run setup route. |
| Friends | `/friends` | Active friends route. |
| Notifications | `/notifications` | Active notifications route. |
| Settings | `/settings` | Active settings route. |
| Achievements | `/achievements` | Active achievements route. |
| Coin Shop | `/coin-shop` | Active coin shop route. |
| Seller dashboard | `/seller` | Active seller dashboard route. |
| Seller onboarding | `/seller/onboarding` | Active seller onboarding route. |
| Seller inventory | `/(tabs)/inventory` | Active seller inventory tab. |
| Admin catalogue | `/admin/japanese-catalogue` | Active admin-only catalogue route. |
| Admin social content | `/admin/social-content` | Active admin-only community content route. |
| Auth login | `/(auth)/login` | Active login route. |
| Auth callback | `/(auth)/callback` | Active Supabase callback route. |
| Password reset | `/(auth)/reset-password` | Active password reset route. |

## Redirect Shims

These routes should stay invisible. They should contain no duplicate UI and should only redirect or re-export the active route component for deep-link compatibility.

| Legacy route | Current destination | Reason |
| --- | --- | --- |
| `/--` | `/` | Expo launcher/deep-link fallback. |
| `/binder-legacy` | `/(tabs)/binder` | Old binder vault link. |
| `/binder` | `/(tabs)/binder` | Collection moved into the tab route. |
| `/collection` | `/(tabs)/binder` | Old collection route. |
| `/community` | `/(tabs)/community` | Community moved into the tab route. |
| `/search` | `/(tabs)/search` | Search moved into the tab route. |
| `/marketplace` | `/(tabs)/market` | Old marketplace spelling. Preserves query params. |
| `/market-place` | `/(tabs)/market` | Old hyphenated marketplace spelling. Preserves query params. |
| `/trade` | `/(tabs)/market?mode=trade` | Trade browsing now lives inside Market. Preserves query params. |
| `/(tabs)/trade` | `/(tabs)/market?mode=trade` | Hidden legacy tab shim. |
| `/trade/[userId]` | `/(tabs)/market?mode=trade&userId=...` | Old user trade-list route. |
| `/camera` | `/scan` | Old camera entry. |
| `/scan/camera` | `/scan` | Old scanner camera route. |
| `/listing` | `/listing/new` | Old listing entry. |
| `/listing/camera` | `/listing/new` | Old listing-camera route. |
| `/listing/[id]` | `/(tabs)/market?listingId=...` | Listing details now open through Market. |
| `/list` | `/listing/new` | Old list-item shortcut. |
| `/user/[id]` | `/community/profile/[userId]` | Public profiles live under Community. |
| `/callback` | `/(auth)/callback` | Supabase legacy redirect URL. |
| `/auth/callback` | `/(auth)/callback` | Supabase legacy redirect URL. |
| `/reset-password` | `/(auth)/reset-password` | Supabase legacy reset URL. |
| `/auth/reset-password` | `/(auth)/reset-password` | Supabase legacy reset URL. |

## Cleanup Rules

- New app links should use `ROUTES` from `lib/routes.ts` where possible.
- A shim can be removed only after `rg` finds no in-app links, push-notification payloads, Supabase redirect URLs, or external docs using it.
- Dynamic shims must keep route params intact. For example, `/listing/[id]` must continue to pass `listingId`, and `/trade/[userId]` must continue to pass `userId`.
- Legacy routes are registered in the root stack with `headerShown: false` and no animation so users never see a duplicate header or old screen shell.
