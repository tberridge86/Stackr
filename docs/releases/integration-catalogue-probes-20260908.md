# Integration catalogue probes — 8 September 2026

These bounded public reads were taken from `https://api.stackrtcg.com/v1` between 16:34 and 16:37 UTC. They are samples, not a coverage census or a device benchmark.

## Public catalogue and asset reads

Both production and `https://stackr-api-gateway-staging.berridge14.workers.dev/v1` returned a 200 catalogue manifest with the same five published shards: `en`, `ja`, `zh-cn`, `zh-tw`, and `ko`. The displayed source versions were dated 19 August for English/Japanese/Traditional Chinese and 9 August for Simplified Chinese/Korean.

| Language | Set/card sample | Card asset result | Set-mark result |
| --- | --- | --- | --- |
| English | Celestial Storm (`01f1a9bb-9eda-4137-a544-c065bb920545`), PokéNav | `available`; `https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/card_image/03/ff/03ff109c51d5ff184406c18024d7cfc40de937dd4cced2679a118f33a78c96e5/original.jpg` returned HTTP 200, JPEG, 129,119 bytes | One `set_logo` record; its URL returned HTTP 200, JPEG, 51,200 bytes. |
| Japanese | SM6 (`04fe9fe1-7206-4215-b9ab-ccea25916593`), フラエッテ 059 | `scan_acquisition_required`; no image URL | `set_logo`, `set_symbol`, and `set_cover` each returned zero records. |
| Simplified Chinese | Dynamax Clash - Set B (`01859240-c3d3-4074-832f-782f61c4fcb6`), 青绵鸟 | `available`; `https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/card_image/8a/5a/8a5a6ef204a56e1ae535254c11ca0d7b9898dfa9dfb35f199c2325d684e59ed1/original.png` returned HTTP 200, PNG, 244,831 bytes | `set_logo`, `set_symbol`, and `set_cover` each returned zero records. |
| Traditional Chinese | SVAM (`005e4850-7601-4765-b538-290882ded6d8`), 寶可夢捕捉器 | `available`; `https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/card_image/a1/8f/a18f898793250e8b56701d79b65241e6750f8185a57cc774bdbc1c997ddf3413/original.jpg` returned HTTP 200, JPEG, 89,861 bytes | `set_logo`, `set_symbol`, and `set_cover` each returned zero records. |

The production API calls for individual set-card samples were 289–3,504 ms. Two unfiltered three-asset manifest reads returned gateway 504 after roughly 8.5 seconds, so catalogue asset reads remain intermittently unreliable.

## Search sample

Production `GET /v1/search?q=pikachu&language=en&limit=1` returned a Chinese Simplified printing (`resultLanguage: zh-cn`, 皮卡丘), while `GET /v1/search?q=%E3%83%94%E3%82%AB%E3%83%81%E3%83%A5%E3%82%A6&language=ja&limit=3` returned no results. Simplified and Traditional Chinese searches for 皮卡丘 each returned results in their requested language.

This is a deployed API filtering defect. The build-27 repair notes record that the database migration exposing the printing language is already live, but that the API source which filters before limiting awaits backend deployment. It should therefore not be represented as fixed by the mobile or renderer changes.

## Client implications

The zero API mark records above mean only that no canonical remote set logo, symbol, or cover was returned for those samples. They do not establish that the app has no presentation fallback. Explore and the search rails first call `getLocalSetArtworkSourceForSet`; the bundled Japanese-logo registry has an exact Japanese `SM6` entry (`assets/rev2/11-japanese-set-logo/logos/sm6.png`) and the runtime lookup returns it for the sampled Japanese SM6 identity. Its explicit-Japanese gate rejects the same ambiguous `SM6` key for English, preventing a Japanese logo from being assigned to an English set with a colliding code.

The sampled Simplified and Traditional Chinese sets had no API mark records. This bounded probe did not establish a bundled fallback for either Chinese identity. When neither a local presentation asset nor a permitted remote asset is available, the renderer uses its generic set icon.

The app tab search is separately debounced by 240 ms and request-id guarded. `runGlobalSearch` has no discovered call site, so its four-language fanout is not evidence of current typing traffic. Its card fanout now queries English, Japanese, Simplified Chinese, and Traditional Chinese in parallel and keeps successful results if an individual language request fails. The accompanying mocked regression test verifies both behaviours.
