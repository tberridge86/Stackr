// Generated review-only Japanese set translation candidates. Public runtime import is rights-gated.
export const JAPANESE_SET_DISPLAY_DRAFT_LOOKUP_METADATA = {
  "schemaVersion": "stackr-japanese-set-display-draft-lookup-v1",
  "sourcePath": "catalogue/japanese-set-display-drafts-source.json",
  "sourceSha256": "e17095374fa563da0a517b0c7f97859ef4525822f226ffb114ed2c428403f7d3",
  "language": "ja",
  "count": 11,
  "displayLabel": "English translation:",
  "status": "model_translation_draft",
  "provenance": "pinned_tcgdex_native_title_and_stackr_editorial_translation_candidate",
  "englishDisplayNameAuthoritative": false,
  "rightsGate": {
    "reviewPath": "catalogue/rights-reviews/cjk-editorial-set-translation-owner-approved.2026-09-04.json",
    "reviewSha256": "756deba35b402b9714937a84f0db88b858945af6d861320dcdca71374630c205",
    "reviewId": "cjk-editorial-set-translation-owner-approved:2026-09-04",
    "reviewStatus": "approved_active_runtime_only",
    "activationAuthorized": true,
    "publicRuntimeImportAuthorized": true,
    "canonicalDatabaseWriteAuthorized": false,
    "ownerAttestationPath": "catalogue/rights-evidence/cjk-app-metadata-permission-owner-attestation.2026-09-04.json",
    "ownerAttestationSha256": "13e9bc1ffa4635cdc10110f0e8dc7356dcb7433d73e60755cc019ba075137d11",
    "verifiedSourceFiles": {
      "catalogue/source-rights-registry.json": "53805cec7470b726190d1b268a2b93c5b0e6d96dd8287428a036f591456b250e",
      "catalogue/rights-evidence/tcgdex-metadata-mit.2026-08-14.json": "178de363fd396d6de895f2bfb36cc91138b58b1cb447a85ae08427b80c3f0b03",
      "catalogue/japanese-set-display-drafts-source.json": "e17095374fa563da0a517b0c7f97859ef4525822f226ffb114ed2c428403f7d3",
      "catalogue/chinese-set-translation-draft-native-name-source.json": "54de7602708fdf2f785393f4c25f27dcd2924fea5179f17c3e5f40914eedf8f6",
      "catalogue/tcgdex-chinese-set-identity-display-source.json": "bef7c15704acca9b2e993398d3f36a9acc630619339dc83dc20284d7983bc629",
      "scripts/build-chinese-set-translation-draft-review-pack.ts": "c6eac83af5f0419c5b42849c3682b89b874765b1cd20d6b32bdb2eee8393eefa"
    },
    "requiredLaneIds": [
      "japanese_editorial_set_translation_candidates"
    ]
  },
  "policy": {
    "use": "review_only_quarantined_pending_amber_approval",
    "nativeNameRemainsPrimary": true,
    "canonicalDatabaseWriteAuthorized": false,
    "artworkAuthorized": false,
    "activationAuthorized": false,
    "publicRuntimeImportAuthorized": false,
    "sourceOfNativeName": "pinned_tcgdex_source_only",
    "removedRedOfficialPageRecordCount": 26,
    "removedRedOfficialPageSourceSha256": "b592f6a61aff3cec174a8dbe734d82c602a70708c6b14314771d8ece57f21b97"
  },
  "exclusions": {
    "ambiguousVariantCodes": [
      "DP4",
      "DP5",
      "SA",
      "MG"
    ],
    "needsVariantReviewCodes": [
      "CLF",
      "DP1",
      "PPP",
      "CLL",
      "DPP",
      "DPtP",
      "CLK",
      "LP"
    ]
  },
  "englishTextStatus": "stackr_non_authoritative_editorial_translation_candidate"
} as const;
export const JAPANESE_SET_DISPLAY_DRAFTS_BY_CODE: Record<string, { canonicalSetId: string; setCode: string; nativeName: string; normalizedNativeName: string; englishTranslation: string; sourceUrl: string; sourceKind: string; sourceSha256: string | null }> = {
  "m6": {
    "canonicalSetId": "47879bc4-23b1-4eed-99d5-ef0f3548418b",
    "setCode": "M6",
    "nativeName": "ストームエメラルダ",
    "normalizedNativeName": "ストームエメラルダ",
    "englishTranslation": "Storm Emeralda",
    "sourceUrl": "https://github.com/tcgdex/cards-database/blob/dd4fc9460b54b91c25df750c68ca36b9946448e2/data-asia/M/M6.ts",
    "sourceKind": "pinned_tcgdex_native_title",
    "sourceSha256": "bb57cf15269a31ab857e526903e2db03bba1ff09e1a198a96c2e51439800e2a2"
  },
  "pcg1": {
    "canonicalSetId": "8063eabc-362a-4f15-a4ec-4ed73824252d",
    "setCode": "PCG1",
    "nativeName": "伝説の飛翔",
    "normalizedNativeName": "伝説の飛翔",
    "englishTranslation": "Flight of Legends",
    "sourceUrl": "https://github.com/tcgdex/cards-database/blob/dd4fc9460b54b91c25df750c68ca36b9946448e2/data-asia/PCG/PCG1.ts",
    "sourceKind": "pinned_tcgdex_native_title",
    "sourceSha256": "3573099ff83929a1da1dd1e7fad056e9e4cee52933cd8c0f540b33f860e5ae0d"
  },
  "pcg10": {
    "canonicalSetId": "81c25448-8d94-4736-a1c6-608597bc9622",
    "setCode": "PCG10",
    "nativeName": "ワールドチャンピオンズパック",
    "normalizedNativeName": "ワールドチャンピオンズパック",
    "englishTranslation": "World Champions Pack",
    "sourceUrl": "https://github.com/tcgdex/cards-database/blob/dd4fc9460b54b91c25df750c68ca36b9946448e2/data-asia/PCG/PCG10.ts",
    "sourceKind": "pinned_tcgdex_native_title",
    "sourceSha256": "9d6253339276e1c076faa7514f50d91d0c878d1ec7054870b020792d5dd7cf07"
  },
  "pcg2": {
    "canonicalSetId": "9fa08d47-d2cd-4829-85b6-819692a6850a",
    "setCode": "PCG2",
    "nativeName": "蒼空の激突",
    "normalizedNativeName": "蒼空の激突",
    "englishTranslation": "Clash of the Blue Sky",
    "sourceUrl": "https://github.com/tcgdex/cards-database/blob/dd4fc9460b54b91c25df750c68ca36b9946448e2/data-asia/PCG/PCG2.ts",
    "sourceKind": "pinned_tcgdex_native_title",
    "sourceSha256": "36c8284e21fadfd63c1dcc0eec8f48fd734fa0f2a97a803057b025849eb2db24"
  },
  "pcg3": {
    "canonicalSetId": "12f2bb10-ec15-4783-bc9b-c946546a1abc",
    "setCode": "PCG3",
    "nativeName": "ロケット団の逆襲",
    "normalizedNativeName": "ロケット団の逆襲",
    "englishTranslation": "Rocket Gang Strikes Back",
    "sourceUrl": "https://github.com/tcgdex/cards-database/blob/dd4fc9460b54b91c25df750c68ca36b9946448e2/data-asia/PCG/PCG3.ts",
    "sourceKind": "pinned_tcgdex_native_title",
    "sourceSha256": "b8f0ba1aa96d01e4e79ca975691499a4acc6780f89e3126efe93df7408997382"
  },
  "pcg4": {
    "canonicalSetId": "af6617ed-ed99-445f-8869-5a330740efc2",
    "setCode": "PCG4",
    "nativeName": "金の空、銀の海",
    "normalizedNativeName": "金の空、銀の海",
    "englishTranslation": "Golden Sky, Silvery Ocean",
    "sourceUrl": "https://github.com/tcgdex/cards-database/blob/dd4fc9460b54b91c25df750c68ca36b9946448e2/data-asia/PCG/PCG4.ts",
    "sourceKind": "pinned_tcgdex_native_title",
    "sourceSha256": "d90d274df69b494681de6473cf3683524a826332ba92d0b821c7d9bc5bdad252"
  },
  "pcg5": {
    "canonicalSetId": "f8cb8c30-41dc-42a3-977a-23baba96fa69",
    "setCode": "PCG5",
    "nativeName": "まぼろしの森",
    "normalizedNativeName": "まぼろしの森",
    "englishTranslation": "Mirage Forest",
    "sourceUrl": "https://github.com/tcgdex/cards-database/blob/dd4fc9460b54b91c25df750c68ca36b9946448e2/data-asia/PCG/PCG5.ts",
    "sourceKind": "pinned_tcgdex_native_title",
    "sourceSha256": "053e7f712902b4cf61e27ebb1b0cc8b65965d8ac4b3534ece0e93f59bcf7be9b"
  },
  "pcg6": {
    "canonicalSetId": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
    "setCode": "PCG6",
    "nativeName": "ホロンの研究塔",
    "normalizedNativeName": "ホロンの研究塔",
    "englishTranslation": "Holon Research Tower",
    "sourceUrl": "https://github.com/tcgdex/cards-database/blob/dd4fc9460b54b91c25df750c68ca36b9946448e2/data-asia/PCG/PCG6.ts",
    "sourceKind": "pinned_tcgdex_native_title",
    "sourceSha256": "b72e5c77398253df002db08153ab7bb398b1be53f75b173ec3b40d141fca42a3"
  },
  "pcg7": {
    "canonicalSetId": "421a8323-4094-4c7f-8622-fb6af390becc",
    "setCode": "PCG7",
    "nativeName": "ホロンの幻影",
    "normalizedNativeName": "ホロンの幻影",
    "englishTranslation": "Holon Phantom",
    "sourceUrl": "https://github.com/tcgdex/cards-database/blob/dd4fc9460b54b91c25df750c68ca36b9946448e2/data-asia/PCG/PCG7.ts",
    "sourceKind": "pinned_tcgdex_native_title",
    "sourceSha256": "820b328486358b6d18d73f92410ed09103f4a0a6259f8ee20224ed37d062a39a"
  },
  "pcg8": {
    "canonicalSetId": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
    "setCode": "PCG8",
    "nativeName": "きせきの結晶",
    "normalizedNativeName": "きせきの結晶",
    "englishTranslation": "Miracle Crystal",
    "sourceUrl": "https://github.com/tcgdex/cards-database/blob/dd4fc9460b54b91c25df750c68ca36b9946448e2/data-asia/PCG/PCG8.ts",
    "sourceKind": "pinned_tcgdex_native_title",
    "sourceSha256": "ca1437d3327093bfd70c0d98f1a6008a7130be15057f11c22dece6214bedf98e"
  },
  "pcg9": {
    "canonicalSetId": "b5ef438a-ddcb-4093-8c9b-572639565af5",
    "setCode": "PCG9",
    "nativeName": "さいはての攻防",
    "normalizedNativeName": "さいはての攻防",
    "englishTranslation": "Offense and Defense of the Furthest Ends",
    "sourceUrl": "https://github.com/tcgdex/cards-database/blob/dd4fc9460b54b91c25df750c68ca36b9946448e2/data-asia/PCG/PCG9.ts",
    "sourceKind": "pinned_tcgdex_native_title",
    "sourceSha256": "b1fa39349b5b06a691159959719e26a12af20e2b7f28acb439a03f065832ab94"
  }
} as const;
