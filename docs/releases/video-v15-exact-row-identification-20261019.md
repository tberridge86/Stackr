# V15: exact Traditional Chinese rows identified

The owner located the original recording on Desktop. Its SHA256 is unchanged from the issue register: `a29ad89ce8cec90b3dfa299c5a951ff4b60d686187f5a27c03a4e6175d1e859c`. A verified copy and original-resolution frames are preserved under `D:/Stackr-organization/evidence/consolidation-20261018/video-desktop-replay-20261019`.

Frames at **02:16 and 02:19** clearly show the Traditional Chinese filter and three generic artwork icons. Visible title prefixes, dates and totals uniquely match the saved factual catalogue records:

| Visible row | Exact identity | Date / displayed cards | Canonical set ID |
| --- | --- | --- | --- |
| Glory of the… | SV10 — Glory of the Rocket Gang / 火箭隊的榮耀 | 2025-05-02 / 132 | `4f84057b-edcf-4523-967c-5997ae696987` |
| Hot Wind Ar… | SV9a — Hot Wind Arena / 熱風競技場 | 2025-03-28 / 92 | `664d717f-745d-4178-ae4f-5863ae558a2f` |
| Battle Partners | SV9 — Battle Partners / 對戰搭檔 | 2025-02-07 / 132 | `cd44897f-ea2e-4f63-b662-e4ddce1ac7e7` |

The recording does not expose UUIDs; those identities come from matching all four visible fields to the saved metadata. The frames were neither resized nor enhanced.

All three are already covered by the owner-approved native pack-art fallbacks in `assets/rev2/12-traditional-chinese-set-logo/owner-supplied-three-pack-art-20261018.json`. Their selected bundled bytes still match that manifest. `lib/traditionalChineseSetLogos.ts` resolves the exact IDs and language, and Discover uses the artwork resolver through `lib/localSetArtwork.ts`. The repair commit `bb9f41030a63274f79004e787ab9bb2f5a2fc89d` is incorporated in main `ddbdb57fe784042e0dd7913c53c07e183283d08a`.

This replay closes the **identity uncertainty**, and demonstrates no additional runtime mapping defect. The selected assets are native product packaging, not standalone logos or a claim of high-definition masters. Existing saved public API checks remain historical delivery evidence; no remote request, catalogue change or publication was performed for this replay.

V15 remains open until the exact current native bytes and all three rows render correctly in Discover, set and binder journeys on the phone. Wi-Fi/mobile data, cold, saved/offline and retry checks remain required. **TestFlight remains held.**

Evidence receipts:

- Preserved recording and initial frames: `receipt.json`, SHA256 `8b4d01d88f7ce7b2261b16ef817cdd8492f8452933c4989356e7f35f09ffa23d`.
- Additional original-resolution frames: `chinese-frames-addendum.json`, SHA256 `b0b883c96395c2d723689492769cab7b8a1b5c6f91bd53586f7983dd2cb69b2f`.
- Exact row, source and asset crosswalk: `v15-exact-video-cohort.json`, SHA256 `1822973433820174468a88653405b2136167e7d86b3be9e12772ab95b521acac`.
