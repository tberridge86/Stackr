import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {loadFrozen,validateRows,validatePlan,validateApproval,validateSourcePlan,STAGING_FIXTURE_POLICY,COHORT_SHA} from './frozen.mjs';
import {assertConfig,createSourceResolver,rollbackReceipt,rollbackSql} from './publish.mjs';
import {readSnapshot,assertSourcePolicies,createMetadataGuard,snapshotHash} from './metadata-guard.mjs';
import {assetId,writeMetadata,rehearse} from '../artwork3303-publish-20260928/publish.mjs';
import {canonicalHash,publicProjection,validatePublishedWitness,validateAuthorityPackets,knownSource,observed} from './source-proof.mjs';
const {plan,rows,approval,receipt,table}=await loadFrozen();
const clone=structuredClone;
const VERSION='1a23b7a7-c50e-4601-9180-a25c950d27ea',STAGE_VERSION='d560cd01-de2a-4713-9518-b967fb4c5ac9';
const oldSources=[
  {
    "id": "5f5909c2-b088-43d7-9f84-5d8686e1c7e4",
    "code": "pricecharting",
    "active": false,
    "base_url": "https://www.pricecharting.com",
    "terms_url": null,
    "created_at": "2026-10-15T21:26:03.082846+00:00",
    "updated_at": "2026-10-15T21:26:03.082846+00:00",
    "source_type": "image",
    "display_name": "PriceCharting (owner supplied card fronts)",
    "deprecated_at": null,
    "robots_policy": null,
    "internal_notes": "Owner-attested source use for exactly Aquapolis Mr. Mime95b and Porygon103b shared printing-front artwork in finite cohort AQUAPOLIS-SHARED-002-20261015. Independent vendor and underlying card licences are unverified. No source-wide approval; each later acquisition requires separate finite approval. Existing provenance rows and source policies must remain unchanged.",
    "licence_status": "under_review",
    "deprecated_reason": null,
    "rate_limit_config": {},
    "source_updated_at": null,
    "attribution_required": true
  },
  {
    "id": "9aacaaee-8915-42aa-9e91-fceaa8422d03",
    "code": "pokellector",
    "active": false,
    "base_url": "https://jp.pokellector.com",
    "terms_url": null,
    "created_at": "2026-10-15T16:04:18.931823+00:00",
    "updated_at": "2026-10-15T16:04:18.931823+00:00",
    "source_type": "image",
    "display_name": "Pokellector (owner supplied Japanese card fronts)",
    "deprecated_at": null,
    "robots_policy": null,
    "internal_notes": "Provenance only; automated acquisition inactive. Owner-attested supplied-site permission for exactly2 Neo2 Ruin Wall reference fronts in STACKR-JA-LEGACY-TRAINER-FRONTS-20261015-008; owner-permission-attestation SHA7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d. No source-wide approval or independently verified vendor licence.",
    "licence_status": "under_review",
    "deprecated_reason": null,
    "rate_limit_config": {},
    "source_updated_at": null,
    "attribution_required": true
  },
  {
    "id": "a6215bb2-738a-4fb5-ace2-18baf3adfe0c",
    "code": "tcgcollector",
    "active": false,
    "base_url": "https://www.tcgcollector.com",
    "terms_url": null,
    "created_at": "2026-10-15T20:03:02.485064+00:00",
    "updated_at": "2026-10-15T20:03:02.485064+00:00",
    "source_type": "image",
    "display_name": "TCGCollector (owner supplied Japanese card fronts)",
    "deprecated_at": null,
    "robots_policy": null,
    "internal_notes": "Provenance only; automated acquisition inactive. Owner-attested supplied-site permission for exactly3 independently accepted Leaders Stadium fronts019/081/096. Bind the final finite preparation/publication decision and exact source selection in the publisher plan. Owner-permission-attestation SHA7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d. No source-wide approval, independently verified vendor licence or physical finish/edition certification. Finite decision SHA256 68f1af735d5e481ed26d1aabbe94e493d520575d9d4191413508f9ec90cf68ff.",
    "licence_status": "under_review",
    "deprecated_reason": null,
    "rate_limit_config": {},
    "source_updated_at": null,
    "attribution_required": true
  },
  {
    "id": "cbcafdd8-f3df-4543-b4e3-b5e8fc6847ab",
    "code": "scrydex",
    "active": false,
    "base_url": "https://scrydex.com",
    "terms_url": null,
    "created_at": "2026-09-27T14:42:49.489402+00:00",
    "updated_at": "2026-09-27T14:42:49.489402+00:00",
    "source_type": "image",
    "display_name": "Scrydex",
    "deprecated_at": null,
    "robots_policy": null,
    "internal_notes": "Provenance only; automated acquisition inactive. Exactly 89 English MEP fronts approved by owner; catalogue/rights-evidence/mep89-scrydex-owner-confirmation.2026-09-27.json; 8c68bf3499de1e1e340b00fc03e5f1b469de7b65d259b5fba5a8b4cd31119ca9. No source-wide approval.",
    "licence_status": "under_review",
    "deprecated_reason": null,
    "rate_limit_config": {},
    "source_updated_at": null,
    "attribution_required": true
  }
];
const logo={"id":"f0e06a69-db22-451f-aefb-58d0393a6d7c","url":"https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/set_logo/reviewed/catalogue/8fdf462f-ca9c-47e7-a92d-1936b082a12d/32dac3554e89648546c58921f25d85a3b0cd52be0a4c423d1508bd76ec3f35d2/delivery.png","width":2172,"height":724,"set_id":"8fdf462f-ca9c-47e7-a92d-1936b082a12d","sha256":"32dac3554e89648546c58921f25d85a3b0cd52be0a4c423d1508bd76ec3f35d2","asset_id":"reviewed:set-logo:8fdf462f-ca9c-47e7-a92d-1936b082a12d:32dac3554e89648546c58921f25d85a3b0cd52be0a4c423d1508bd76ec3f35d2","byte_size":660459,"game_code":"pokemon","mime_type":"image/png","source_id":"a23954d2-49ca-4f2e-8cee-ed628e179006","asset_type":"set_logo","created_at":"2026-10-09T14:57:11.89612+00:00","deleted_at":null,"updated_at":"2026-10-09T14:57:11.89612+00:00","variant_id":null,"printing_id":null,"storage_key":"public/set_logo/reviewed/catalogue/8fdf462f-ca9c-47e7-a92d-1936b082a12d/32dac3554e89648546c58921f25d85a3b0cd52be0a4c423d1508bd76ec3f35d2/delivery.png","storage_path":"public/set_logo/reviewed/catalogue/8fdf462f-ca9c-47e7-a92d-1936b082a12d/32dac3554e89648546c58921f25d85a3b0cd52be0a4c423d1508bd76ec3f35d2/delivery.png","cache_control":"public, max-age=31536000, immutable","deprecated_at":null,"rights_status":"approved","content_sha256":"32dac3554e89648546c58921f25d85a3b0cd52be0a4c423d1508bd76ec3f35d2","storage_bucket":"stackr-catalogue-public","deletion_reason":null,"derivative_list":[],"perceptual_hash":null,"retention_until":null,"asset_visibility":"public_catalogue","attribution_text":null,"last_verified_at":"2026-10-09T14:57:11.89612+00:00","retention_status":"active","storage_provider":"supabase_storage","deprecated_reason":null,"permission_status":"approved","publicly_servable":true,"source_updated_at":null,"acquisition_source":"existing_stackr_catalogue_asset","source_attribution":"User-approved Stackr set presentation; source_logo; byte_preserved","unavailable_reason":null,"original_source_url":null,"archival_storage_key":null,"externally_referenced":false,"licensing_review_notes":"{\"fallback\": false, \"aiAssisted\": false, \"approvedAt\": \"2026-10-09\", \"processing\": \"byte_preserved\", \"displayCrop\": null, \"matchMethod\": \"unique_exact_language_name\", \"sourceWidth\": 2172, \"sourceHeight\": 724, \"sourceSha256\": \"32dac3554e89648546c58921f25d85a3b0cd52be0a4c423d1508bd76ec3f35d2\", \"representation\": \"source_logo\"}","original_source_identifier":"stackr-reviewed-set-logo:09f34aa860ed9d3650f5cd400194a5297fb3a4a7f69da0cda7a78b7447de8e70","recognition_reference_eligible":false};
const baselineAssets={production:[logo],staging:[]};
const baselineLinks={production:[{asset_id:logo.id,catalogue_version_id:VERSION,language_code:'ja',asset_type:'set_logo',set_id:rows[0].set_id,printing_id:null,variant_id:null}],staging:[]};
const journal=()=>({assets:[],links:[],metadata_changes:0});
const frozenBefore={
  "production": [
    {
      "scope": "assets",
      "identity": "f0e06a69-db22-451f-aefb-58d0393a6d7c",
      "payload": {
        "id": "f0e06a69-db22-451f-aefb-58d0393a6d7c",
        "url": "https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/set_logo/reviewed/catalogue/8fdf462f-ca9c-47e7-a92d-1936b082a12d/32dac3554e89648546c58921f25d85a3b0cd52be0a4c423d1508bd76ec3f35d2/delivery.png",
        "width": 2172,
        "height": 724,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "sha256": "32dac3554e89648546c58921f25d85a3b0cd52be0a4c423d1508bd76ec3f35d2",
        "asset_id": "reviewed:set-logo:8fdf462f-ca9c-47e7-a92d-1936b082a12d:32dac3554e89648546c58921f25d85a3b0cd52be0a4c423d1508bd76ec3f35d2",
        "byte_size": 660459,
        "game_code": "pokemon",
        "mime_type": "image/png",
        "source_id": "a23954d2-49ca-4f2e-8cee-ed628e179006",
        "asset_type": "set_logo",
        "created_at": "2026-10-09T14:57:11.89612+00:00",
        "deleted_at": null,
        "updated_at": "2026-10-09T14:57:11.89612+00:00",
        "variant_id": null,
        "printing_id": null,
        "storage_key": "public/set_logo/reviewed/catalogue/8fdf462f-ca9c-47e7-a92d-1936b082a12d/32dac3554e89648546c58921f25d85a3b0cd52be0a4c423d1508bd76ec3f35d2/delivery.png",
        "storage_path": "public/set_logo/reviewed/catalogue/8fdf462f-ca9c-47e7-a92d-1936b082a12d/32dac3554e89648546c58921f25d85a3b0cd52be0a4c423d1508bd76ec3f35d2/delivery.png",
        "cache_control": "public, max-age=31536000, immutable",
        "deprecated_at": null,
        "rights_status": "approved",
        "content_sha256": "32dac3554e89648546c58921f25d85a3b0cd52be0a4c423d1508bd76ec3f35d2",
        "storage_bucket": "stackr-catalogue-public",
        "deletion_reason": null,
        "derivative_list": [],
        "perceptual_hash": null,
        "retention_until": null,
        "asset_visibility": "public_catalogue",
        "attribution_text": null,
        "last_verified_at": "2026-10-09T14:57:11.89612+00:00",
        "retention_status": "active",
        "storage_provider": "supabase_storage",
        "deprecated_reason": null,
        "permission_status": "approved",
        "publicly_servable": true,
        "source_updated_at": null,
        "acquisition_source": "existing_stackr_catalogue_asset",
        "source_attribution": "User-approved Stackr set presentation; source_logo; byte_preserved",
        "unavailable_reason": null,
        "original_source_url": null,
        "archival_storage_key": null,
        "externally_referenced": false,
        "licensing_review_notes": "{\"fallback\": false, \"aiAssisted\": false, \"approvedAt\": \"2026-10-09\", \"processing\": \"byte_preserved\", \"displayCrop\": null, \"matchMethod\": \"unique_exact_language_name\", \"sourceWidth\": 2172, \"sourceHeight\": 724, \"sourceSha256\": \"32dac3554e89648546c58921f25d85a3b0cd52be0a4c423d1508bd76ec3f35d2\", \"representation\": \"source_logo\"}",
        "original_source_identifier": "stackr-reviewed-set-logo:09f34aa860ed9d3650f5cd400194a5297fb3a4a7f69da0cda7a78b7447de8e70",
        "recognition_reference_eligible": false
      }
    },
    {
      "scope": "links",
      "identity": "1a23b7a7-c50e-4601-9180-a25c950d27ea:f0e06a69-db22-451f-aefb-58d0393a6d7c",
      "payload": {
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "asset_id": "f0e06a69-db22-451f-aefb-58d0393a6d7c",
        "asset_type": "set_logo",
        "created_at": "2026-10-09T14:57:11.89612+00:00",
        "variant_id": null,
        "printing_id": null,
        "language_code": "ja",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea"
      }
    },
    {
      "scope": "names",
      "identity": "05abdad9-96dc-4e3f-b312-0d31bc35c7e5",
      "payload": {
        "id": "05abdad9-96dc-4e3f-b312-0d31bc35c7e5",
        "name": "サラメンス（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T12:51:55.261+00:00",
        "updated_at": "2026-08-06T12:51:55.261+00:00",
        "variant_id": "6451b1a6-b023-402b-822f-3409512df5d9",
        "printing_id": "bcb2a732-f043-4eac-a767-6515f1c5408d",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "サラメンス(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "2c3357a5-998f-447d-a7d8-2e24d4d73a4f",
      "payload": {
        "id": "2c3357a5-998f-447d-a7d8-2e24d4d73a4f",
        "name": "マイティエナ（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T21:24:59.749+00:00",
        "updated_at": "2026-08-06T21:24:59.749+00:00",
        "variant_id": "ccbaab4d-efdc-4110-b435-1ca275b2f58d",
        "printing_id": "701a96ec-0100-41ea-b324-b6adc450fb2f",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "マイティエナ(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "2dc2358d-6e41-4ece-9e8b-9d8c92736879",
      "payload": {
        "id": "2dc2358d-6e41-4ece-9e8b-9d8c92736879",
        "name": "ティラニター（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T12:48:35.754+00:00",
        "updated_at": "2026-08-06T12:48:35.754+00:00",
        "variant_id": "71aa1bf4-7e11-4350-8c06-2b195e696a9f",
        "printing_id": "faebe598-d6b1-4240-bcee-ba9dddf47bca",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ティラニター(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "35c0c801-d6ba-4f27-86ce-ae7ac8df578c",
      "payload": {
        "id": "35c0c801-d6ba-4f27-86ce-ae7ac8df578c",
        "name": "Holon Farmer",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:25:17.388+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "88c960dd-5bb1-4ec4-a530-886f823a1cfb",
        "printing_id": "bafca88a-6810-411a-8a1f-ca250618a502",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "holon farmer",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "55c1350c-73ac-4a75-b2c3-cdbc1b8bfafc",
      "payload": {
        "id": "55c1350c-73ac-4a75-b2c3-cdbc1b8bfafc",
        "name": "ホロンエネルギーff",
        "name_type": "native",
        "created_at": "2026-08-06T21:25:20.62+00:00",
        "updated_at": "2026-08-06T21:25:20.62+00:00",
        "variant_id": "95aa1d56-b97a-4c68-b669-f9e83e7af868",
        "printing_id": "cc1681cb-030e-4d1e-a144-d68ff927f111",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ホロンエネルギーff",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "596cd656-4c5b-41e0-8ed7-aa2b9ff559bd",
      "payload": {
        "id": "596cd656-4c5b-41e0-8ed7-aa2b9ff559bd",
        "name": "Mightyena Delta Species",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:25:02.423+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "ccbaab4d-efdc-4110-b435-1ca275b2f58d",
        "printing_id": "701a96ec-0100-41ea-b324-b6adc450fb2f",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "mightyena delta species",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "6f6a4bbb-5a79-4717-9271-923aa8f89a0f",
      "payload": {
        "id": "6f6a4bbb-5a79-4717-9271-923aa8f89a0f",
        "name": "Tyranitar Delta Species",
        "name_type": "english_display",
        "created_at": "2026-08-06T12:48:38.331+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "71aa1bf4-7e11-4350-8c06-2b195e696a9f",
        "printing_id": "faebe598-d6b1-4240-bcee-ba9dddf47bca",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "tyranitar delta species",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "7478f32f-5d86-4992-8b81-7c2f032fa4ac",
      "payload": {
        "id": "7478f32f-5d86-4992-8b81-7c2f032fa4ac",
        "name": "ホロン農家",
        "name_type": "native",
        "created_at": "2026-08-06T21:25:16.122+00:00",
        "updated_at": "2026-08-06T21:25:16.122+00:00",
        "variant_id": "88c960dd-5bb1-4ec4-a530-886f823a1cfb",
        "printing_id": "bafca88a-6810-411a-8a1f-ca250618a502",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ホロン農家",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "8006c719-97b8-4abb-9a58-d436b3b53a70",
      "payload": {
        "id": "8006c719-97b8-4abb-9a58-d436b3b53a70",
        "name": "Ditto",
        "name_type": "english_display",
        "created_at": "2026-08-06T10:39:58.543+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "19dfe7aa-93aa-44df-9bb2-2b41ff800a4e",
        "printing_id": "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "ditto",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "9dda6198-ce67-481b-b732-eb2c820a6967",
      "payload": {
        "id": "9dda6198-ce67-481b-b732-eb2c820a6967",
        "name": "ホロン研究者",
        "name_type": "native",
        "created_at": "2026-08-06T21:25:13.147+00:00",
        "updated_at": "2026-08-06T21:25:13.147+00:00",
        "variant_id": "33542dbb-3aee-4441-bc34-15d6c1743acc",
        "printing_id": "7734f437-9514-4c5a-ace5-7359a60216ad",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ホロン研究者",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "a3270a96-cf42-4ff4-a75a-b4caaebf056a",
      "payload": {
        "id": "a3270a96-cf42-4ff4-a75a-b4caaebf056a",
        "name": "ホロン遺跡",
        "name_type": "native",
        "created_at": "2026-08-06T21:25:20.843+00:00",
        "updated_at": "2026-08-06T21:25:20.843+00:00",
        "variant_id": "0379b17a-5e24-4caa-85dd-48b7da2f195d",
        "printing_id": "6176b1d7-f194-4edb-a627-c0a73fa04f5b",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ホロン遺跡",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "b5d8ad8f-2616-4660-84ed-24126636078c",
      "payload": {
        "id": "b5d8ad8f-2616-4660-84ed-24126636078c",
        "name": "Holon Energy FF",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:25:21.695+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "95aa1d56-b97a-4c68-b669-f9e83e7af868",
        "printing_id": "cc1681cb-030e-4d1e-a144-d68ff927f111",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "holon energy ff",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "c88a676b-893f-4622-b441-7b5cdc315ef1",
      "payload": {
        "id": "c88a676b-893f-4622-b441-7b5cdc315ef1",
        "name": "Holon Researcher",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:25:14.573+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "33542dbb-3aee-4441-bc34-15d6c1743acc",
        "printing_id": "7734f437-9514-4c5a-ace5-7359a60216ad",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "holon researcher",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "cf2b51f6-bb44-4083-9aa3-86a814fc43f3",
      "payload": {
        "id": "cf2b51f6-bb44-4083-9aa3-86a814fc43f3",
        "name": "ホロンエネルギーwp",
        "name_type": "native",
        "created_at": "2026-08-06T21:25:22.415+00:00",
        "updated_at": "2026-08-06T21:25:22.415+00:00",
        "variant_id": "2a28827b-2cfe-49e6-ae63-c300c08798e6",
        "printing_id": "335d5820-4616-49be-89ff-5c8f494e1940",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ホロンエネルギーwp",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "d0deb8fe-c60f-4f7a-a005-46142d6a3ce7",
      "payload": {
        "id": "d0deb8fe-c60f-4f7a-a005-46142d6a3ce7",
        "name": "Drowzee",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:24:22.942+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "32577dac-0959-40b9-9eb6-879c52dd3c93",
        "printing_id": "fc9ae1df-0f27-470e-a866-3178f51b68c4",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "drowzee",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "ea8fc159-db90-4b65-b551-2773d6556d7b",
      "payload": {
        "id": "ea8fc159-db90-4b65-b551-2773d6556d7b",
        "name": "ドロージー",
        "name_type": "native",
        "created_at": "2026-08-06T21:24:21.754+00:00",
        "updated_at": "2026-08-06T21:24:21.754+00:00",
        "variant_id": "32577dac-0959-40b9-9eb6-879c52dd3c93",
        "printing_id": "fc9ae1df-0f27-470e-a866-3178f51b68c4",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ドロージー",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "f20e7819-08ca-4cf9-bcc9-47767acfa40e",
      "payload": {
        "id": "f20e7819-08ca-4cf9-bcc9-47767acfa40e",
        "name": "Salamence Delta Species",
        "name_type": "english_display",
        "created_at": "2026-08-06T12:51:58.099+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "6451b1a6-b023-402b-822f-3409512df5d9",
        "printing_id": "bcb2a732-f043-4eac-a767-6515f1c5408d",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "salamence delta species",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "f2905231-51df-4f69-8caf-bd8d877494ee",
      "payload": {
        "id": "f2905231-51df-4f69-8caf-bd8d877494ee",
        "name": "Holon Ruins",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:25:22.026+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "0379b17a-5e24-4caa-85dd-48b7da2f195d",
        "printing_id": "6176b1d7-f194-4edb-a627-c0a73fa04f5b",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "holon ruins",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "f9590c83-175c-4b80-b025-1b98152dd1c7",
      "payload": {
        "id": "f9590c83-175c-4b80-b025-1b98152dd1c7",
        "name": "Holon Energy WP",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:25:22.853+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "2a28827b-2cfe-49e6-ae63-c300c08798e6",
        "printing_id": "335d5820-4616-49be-89ff-5c8f494e1940",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "holon energy wp",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "ff90b3a5-e7d1-4160-884c-55af2b85f046",
      "payload": {
        "id": "ff90b3a5-e7d1-4160-884c-55af2b85f046",
        "name": "同上",
        "name_type": "native",
        "created_at": "2026-08-06T10:39:56.421+00:00",
        "updated_at": "2026-08-06T10:39:56.421+00:00",
        "variant_id": "19dfe7aa-93aa-44df-9bb2-2b41ff800a4e",
        "printing_id": "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "同上",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "printings",
      "identity": "335d5820-4616-49be-89ff-5c8f494e1940",
      "payload": {
        "id": "335d5820-4616-49be-89ff-5c8f494e1940",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:25:21.404+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "ホロンエネルギーwp",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "e460ca25-9420-48d1-823c-1c4606a74ada",
        "discontinued_at": null,
        "collector_number": "086",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Holon Energy WP",
        "collector_number_sort": 86,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000086"
      }
    },
    {
      "scope": "printings",
      "identity": "6176b1d7-f194-4edb-a627-c0a73fa04f5b",
      "payload": {
        "id": "6176b1d7-f194-4edb-a627-c0a73fa04f5b",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:25:17.949+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "ホロン遺跡",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "bcd305b9-b3ce-453f-ba3c-09d04a589af4",
        "discontinued_at": null,
        "collector_number": "083",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Holon Ruins",
        "collector_number_sort": 83,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000083"
      }
    },
    {
      "scope": "printings",
      "identity": "701a96ec-0100-41ea-b324-b6adc450fb2f",
      "payload": {
        "id": "701a96ec-0100-41ea-b324-b6adc450fb2f",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "b92f9cd1-5e40-4b96-b021-49425d5f3b74",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:24:56.327+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "マイティエナ（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "e8c0e5eb-95b4-45e4-8f6c-38dfa26e5c4f",
        "discontinued_at": null,
        "collector_number": "070",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Mightyena Delta Species",
        "collector_number_sort": 70,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000070"
      }
    },
    {
      "scope": "printings",
      "identity": "7734f437-9514-4c5a-ace5-7359a60216ad",
      "payload": {
        "id": "7734f437-9514-4c5a-ace5-7359a60216ad",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:25:09.173+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "ホロン研究者",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "edb21ee8-99c1-45b5-8e4d-6d00ecb78041",
        "discontinued_at": null,
        "collector_number": "078",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Holon Researcher",
        "collector_number_sort": 78,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000078"
      }
    },
    {
      "scope": "printings",
      "identity": "bafca88a-6810-411a-8a1f-ca250618a502",
      "payload": {
        "id": "bafca88a-6810-411a-8a1f-ca250618a502",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:25:13.75+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "ホロン農家",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "77ba482c-7b52-4de5-b41d-ce5c0e83dea0",
        "discontinued_at": null,
        "collector_number": "080",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Holon Farmer",
        "collector_number_sort": 80,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000080"
      }
    },
    {
      "scope": "printings",
      "identity": "bcb2a732-f043-4eac-a767-6515f1c5408d",
      "payload": {
        "id": "bcb2a732-f043-4eac-a767-6515f1c5408d",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "b92f9cd1-5e40-4b96-b021-49425d5f3b74",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T12:51:49.976+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "サラメンス（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "ca249fb2-1bc6-4ddb-ba4b-607dc6de87de",
        "discontinued_at": null,
        "collector_number": "021",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Salamence Delta Species",
        "collector_number_sort": 21,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000021"
      }
    },
    {
      "scope": "printings",
      "identity": "cc1681cb-030e-4d1e-a144-d68ff927f111",
      "payload": {
        "id": "cc1681cb-030e-4d1e-a144-d68ff927f111",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:25:18.122+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "ホロンエネルギーff",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "47cb96b6-774a-42b5-8a7b-fe91292a57f1",
        "discontinued_at": null,
        "collector_number": "085",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Holon Energy FF",
        "collector_number_sort": 85,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000085"
      }
    },
    {
      "scope": "printings",
      "identity": "faebe598-d6b1-4240-bcee-ba9dddf47bca",
      "payload": {
        "id": "faebe598-d6b1-4240-bcee-ba9dddf47bca",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "b92f9cd1-5e40-4b96-b021-49425d5f3b74",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T12:48:32.692+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "ティラニター（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "ec548df0-d648-41e6-b42a-1036924914f2",
        "discontinued_at": null,
        "collector_number": "020",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Tyranitar Delta Species",
        "collector_number_sort": 20,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000020"
      }
    },
    {
      "scope": "printings",
      "identity": "fc9ae1df-0f27-470e-a866-3178f51b68c4",
      "payload": {
        "id": "fc9ae1df-0f27-470e-a866-3178f51b68c4",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "d3aeeb9c-841e-4088-8fa8-bc4028b800de",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:24:20.525+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "ドロージー",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "1e287040-fa09-4792-b0eb-3483b0dbed72",
        "discontinued_at": null,
        "collector_number": "044",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Drowzee",
        "collector_number_sort": 44,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000044"
      }
    },
    {
      "scope": "printings",
      "identity": "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d",
      "payload": {
        "id": "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "b92f9cd1-5e40-4b96-b021-49425d5f3b74",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T10:39:46.059+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "同上",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "1843a4e7-8672-4365-a920-a59e44f860d8",
        "discontinued_at": null,
        "collector_number": "007",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Ditto",
        "collector_number_sort": 7,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000007"
      }
    },
    {
      "scope": "sets",
      "identity": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
      "payload": {
        "id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "total": 86,
        "set_code": "PCG6",
        "game_code": "pokemon",
        "series_id": null,
        "created_at": "2026-08-05T13:48:53.986+00:00",
        "updated_at": "2026-09-27T06:36:24.294582+00:00",
        "native_name": "ホロンの研究塔",
        "region_code": null,
        "release_date": "2005-10-28",
        "deprecated_at": null,
        "display_order": null,
        "language_code": "ja",
        "printed_total": 86,
        "discontinued_at": null,
        "deprecated_reason": null,
        "provider_set_code": "PCG6",
        "source_updated_at": null,
        "corrected_by_set_id": null,
        "english_display_name": "Holon Research Tower"
      }
    },
    {
      "scope": "sources",
      "identity": "5f5909c2-b088-43d7-9f84-5d8686e1c7e4",
      "payload": {
        "id": "5f5909c2-b088-43d7-9f84-5d8686e1c7e4",
        "code": "pricecharting",
        "active": false,
        "base_url": "https://www.pricecharting.com",
        "terms_url": null,
        "created_at": "2026-10-15T21:26:03.082846+00:00",
        "updated_at": "2026-10-15T21:26:03.082846+00:00",
        "source_type": "image",
        "display_name": "PriceCharting (owner supplied card fronts)",
        "deprecated_at": null,
        "robots_policy": null,
        "internal_notes": "Owner-attested source use for exactly Aquapolis Mr. Mime95b and Porygon103b shared printing-front artwork in finite cohort AQUAPOLIS-SHARED-002-20261015. Independent vendor and underlying card licences are unverified. No source-wide approval; each later acquisition requires separate finite approval. Existing provenance rows and source policies must remain unchanged.",
        "licence_status": "under_review",
        "deprecated_reason": null,
        "rate_limit_config": {},
        "source_updated_at": null,
        "attribution_required": true
      }
    },
    {
      "scope": "sources",
      "identity": "9aacaaee-8915-42aa-9e91-fceaa8422d03",
      "payload": {
        "id": "9aacaaee-8915-42aa-9e91-fceaa8422d03",
        "code": "pokellector",
        "active": false,
        "base_url": "https://jp.pokellector.com",
        "terms_url": null,
        "created_at": "2026-10-15T16:04:18.931823+00:00",
        "updated_at": "2026-10-15T16:04:18.931823+00:00",
        "source_type": "image",
        "display_name": "Pokellector (owner supplied Japanese card fronts)",
        "deprecated_at": null,
        "robots_policy": null,
        "internal_notes": "Provenance only; automated acquisition inactive. Owner-attested supplied-site permission for exactly2 Neo2 Ruin Wall reference fronts in STACKR-JA-LEGACY-TRAINER-FRONTS-20261015-008; owner-permission-attestation SHA7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d. No source-wide approval or independently verified vendor licence.",
        "licence_status": "under_review",
        "deprecated_reason": null,
        "rate_limit_config": {},
        "source_updated_at": null,
        "attribution_required": true
      }
    },
    {
      "scope": "sources",
      "identity": "a6215bb2-738a-4fb5-ace2-18baf3adfe0c",
      "payload": {
        "id": "a6215bb2-738a-4fb5-ace2-18baf3adfe0c",
        "code": "tcgcollector",
        "active": false,
        "base_url": "https://www.tcgcollector.com",
        "terms_url": null,
        "created_at": "2026-10-15T20:03:02.485064+00:00",
        "updated_at": "2026-10-15T20:03:02.485064+00:00",
        "source_type": "image",
        "display_name": "TCGCollector (owner supplied Japanese card fronts)",
        "deprecated_at": null,
        "robots_policy": null,
        "internal_notes": "Provenance only; automated acquisition inactive. Owner-attested supplied-site permission for exactly3 independently accepted Leaders Stadium fronts019/081/096. Bind the final finite preparation/publication decision and exact source selection in the publisher plan. Owner-permission-attestation SHA7978e1e3806482acc9b44030ef6071c7b8c4d53529dbea3c75ebbb78c0eb6e3d. No source-wide approval, independently verified vendor licence or physical finish/edition certification. Finite decision SHA256 68f1af735d5e481ed26d1aabbe94e493d520575d9d4191413508f9ec90cf68ff.",
        "licence_status": "under_review",
        "deprecated_reason": null,
        "rate_limit_config": {},
        "source_updated_at": null,
        "attribution_required": true
      }
    },
    {
      "scope": "sources",
      "identity": "cbcafdd8-f3df-4543-b4e3-b5e8fc6847ab",
      "payload": {
        "id": "cbcafdd8-f3df-4543-b4e3-b5e8fc6847ab",
        "code": "scrydex",
        "active": false,
        "base_url": "https://scrydex.com",
        "terms_url": null,
        "created_at": "2026-09-27T14:42:49.489402+00:00",
        "updated_at": "2026-09-27T14:42:49.489402+00:00",
        "source_type": "image",
        "display_name": "Scrydex",
        "deprecated_at": null,
        "robots_policy": null,
        "internal_notes": "Provenance only; automated acquisition inactive. Exactly 89 English MEP fronts approved by owner; catalogue/rights-evidence/mep89-scrydex-owner-confirmation.2026-09-27.json; 8c68bf3499de1e1e340b00fc03e5f1b469de7b65d259b5fba5a8b4cd31119ca9. No source-wide approval.",
        "licence_status": "under_review",
        "deprecated_reason": null,
        "rate_limit_config": {},
        "source_updated_at": null,
        "attribution_required": true
      }
    },
    {
      "scope": "variants",
      "identity": "0379b17a-5e24-4caa-85dd-48b7da2f195d",
      "payload": {
        "id": "0379b17a-5e24-4caa-85dd-48b7da2f195d",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:25:19.157+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "6176b1d7-f194-4edb-a627-c0a73fa04f5b",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:083:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "083",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "19dfe7aa-93aa-44df-9bb2-2b41ff800a4e",
      "payload": {
        "id": "19dfe7aa-93aa-44df-9bb2-2b41ff800a4e",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T10:39:47.913+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:007:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "007",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "2a28827b-2cfe-49e6-ae63-c300c08798e6",
      "payload": {
        "id": "2a28827b-2cfe-49e6-ae63-c300c08798e6",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:25:21.893+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "335d5820-4616-49be-89ff-5c8f494e1940",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:086:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "086",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "32577dac-0959-40b9-9eb6-879c52dd3c93",
      "payload": {
        "id": "32577dac-0959-40b9-9eb6-879c52dd3c93",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:24:20.99+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "fc9ae1df-0f27-470e-a866-3178f51b68c4",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:044:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "044",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "33542dbb-3aee-4441-bc34-15d6c1743acc",
      "payload": {
        "id": "33542dbb-3aee-4441-bc34-15d6c1743acc",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:25:11.086+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "7734f437-9514-4c5a-ace5-7359a60216ad",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:078:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "078",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "6451b1a6-b023-402b-822f-3409512df5d9",
      "payload": {
        "id": "6451b1a6-b023-402b-822f-3409512df5d9",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T12:51:52.105+00:00",
        "is_default": false,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "bcb2a732-f043-4eac-a767-6515f1c5408d",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:021:holo",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "021",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "71aa1bf4-7e11-4350-8c06-2b195e696a9f",
      "payload": {
        "id": "71aa1bf4-7e11-4350-8c06-2b195e696a9f",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T12:48:33.683+00:00",
        "is_default": false,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "faebe598-d6b1-4240-bcee-ba9dddf47bca",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:020:holo",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "020",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "88c960dd-5bb1-4ec4-a530-886f823a1cfb",
      "payload": {
        "id": "88c960dd-5bb1-4ec4-a530-886f823a1cfb",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:25:14.183+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "bafca88a-6810-411a-8a1f-ca250618a502",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:080:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "080",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "95aa1d56-b97a-4c68-b669-f9e83e7af868",
      "payload": {
        "id": "95aa1d56-b97a-4c68-b669-f9e83e7af868",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:25:19.158+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "cc1681cb-030e-4d1e-a144-d68ff927f111",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:085:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "085",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "ccbaab4d-efdc-4110-b435-1ca275b2f58d",
      "payload": {
        "id": "ccbaab4d-efdc-4110-b435-1ca275b2f58d",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:24:58.417+00:00",
        "is_default": false,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "701a96ec-0100-41ea-b324-b6adc450fb2f",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:070:holo",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "070",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    }
  ],
  "staging": [
    {
      "scope": "names",
      "identity": "05abdad9-96dc-4e3f-b312-0d31bc35c7e5",
      "payload": {
        "id": "05abdad9-96dc-4e3f-b312-0d31bc35c7e5",
        "name": "サラメンス（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T12:51:55.261012+00:00",
        "updated_at": "2026-08-06T12:51:55.261012+00:00",
        "variant_id": "6451b1a6-b023-402b-822f-3409512df5d9",
        "printing_id": "bcb2a732-f043-4eac-a767-6515f1c5408d",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "サラメンス(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "2c3357a5-998f-447d-a7d8-2e24d4d73a4f",
      "payload": {
        "id": "2c3357a5-998f-447d-a7d8-2e24d4d73a4f",
        "name": "マイティエナ（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T21:24:59.749612+00:00",
        "updated_at": "2026-08-06T21:24:59.749612+00:00",
        "variant_id": "ccbaab4d-efdc-4110-b435-1ca275b2f58d",
        "printing_id": "701a96ec-0100-41ea-b324-b6adc450fb2f",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "マイティエナ(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "2dc2358d-6e41-4ece-9e8b-9d8c92736879",
      "payload": {
        "id": "2dc2358d-6e41-4ece-9e8b-9d8c92736879",
        "name": "ティラニター（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T12:48:35.754759+00:00",
        "updated_at": "2026-08-06T12:48:35.754759+00:00",
        "variant_id": "71aa1bf4-7e11-4350-8c06-2b195e696a9f",
        "printing_id": "faebe598-d6b1-4240-bcee-ba9dddf47bca",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ティラニター(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "35c0c801-d6ba-4f27-86ce-ae7ac8df578c",
      "payload": {
        "id": "35c0c801-d6ba-4f27-86ce-ae7ac8df578c",
        "name": "ホロン農家",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:25:17.388505+00:00",
        "updated_at": "2026-08-06T21:25:17.388505+00:00",
        "variant_id": "88c960dd-5bb1-4ec4-a530-886f823a1cfb",
        "printing_id": "bafca88a-6810-411a-8a1f-ca250618a502",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "ホロン農家",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "55c1350c-73ac-4a75-b2c3-cdbc1b8bfafc",
      "payload": {
        "id": "55c1350c-73ac-4a75-b2c3-cdbc1b8bfafc",
        "name": "ホロンエネルギーff",
        "name_type": "native",
        "created_at": "2026-08-06T21:25:20.620814+00:00",
        "updated_at": "2026-08-06T21:25:20.620814+00:00",
        "variant_id": "95aa1d56-b97a-4c68-b669-f9e83e7af868",
        "printing_id": "cc1681cb-030e-4d1e-a144-d68ff927f111",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ホロンエネルギーff",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "596cd656-4c5b-41e0-8ed7-aa2b9ff559bd",
      "payload": {
        "id": "596cd656-4c5b-41e0-8ed7-aa2b9ff559bd",
        "name": "マイティエナ（デルタ種）",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:25:02.423759+00:00",
        "updated_at": "2026-08-06T21:25:02.423759+00:00",
        "variant_id": "ccbaab4d-efdc-4110-b435-1ca275b2f58d",
        "printing_id": "701a96ec-0100-41ea-b324-b6adc450fb2f",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "マイティエナ(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "6f6a4bbb-5a79-4717-9271-923aa8f89a0f",
      "payload": {
        "id": "6f6a4bbb-5a79-4717-9271-923aa8f89a0f",
        "name": "ティラニター（デルタ種）",
        "name_type": "english_display",
        "created_at": "2026-08-06T12:48:38.33115+00:00",
        "updated_at": "2026-08-06T12:48:38.33115+00:00",
        "variant_id": "71aa1bf4-7e11-4350-8c06-2b195e696a9f",
        "printing_id": "faebe598-d6b1-4240-bcee-ba9dddf47bca",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "ティラニター(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "7478f32f-5d86-4992-8b81-7c2f032fa4ac",
      "payload": {
        "id": "7478f32f-5d86-4992-8b81-7c2f032fa4ac",
        "name": "ホロン農家",
        "name_type": "native",
        "created_at": "2026-08-06T21:25:16.122218+00:00",
        "updated_at": "2026-08-06T21:25:16.122218+00:00",
        "variant_id": "88c960dd-5bb1-4ec4-a530-886f823a1cfb",
        "printing_id": "bafca88a-6810-411a-8a1f-ca250618a502",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ホロン農家",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "8006c719-97b8-4abb-9a58-d436b3b53a70",
      "payload": {
        "id": "8006c719-97b8-4abb-9a58-d436b3b53a70",
        "name": "同上",
        "name_type": "english_display",
        "created_at": "2026-08-06T10:39:58.543198+00:00",
        "updated_at": "2026-08-06T10:39:58.543198+00:00",
        "variant_id": "19dfe7aa-93aa-44df-9bb2-2b41ff800a4e",
        "printing_id": "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "同上",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "9dda6198-ce67-481b-b732-eb2c820a6967",
      "payload": {
        "id": "9dda6198-ce67-481b-b732-eb2c820a6967",
        "name": "ホロン研究者",
        "name_type": "native",
        "created_at": "2026-08-06T21:25:13.147424+00:00",
        "updated_at": "2026-08-06T21:25:13.147424+00:00",
        "variant_id": "33542dbb-3aee-4441-bc34-15d6c1743acc",
        "printing_id": "7734f437-9514-4c5a-ace5-7359a60216ad",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ホロン研究者",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "a3270a96-cf42-4ff4-a75a-b4caaebf056a",
      "payload": {
        "id": "a3270a96-cf42-4ff4-a75a-b4caaebf056a",
        "name": "ホロン遺跡",
        "name_type": "native",
        "created_at": "2026-08-06T21:25:20.843945+00:00",
        "updated_at": "2026-08-06T21:25:20.843945+00:00",
        "variant_id": "0379b17a-5e24-4caa-85dd-48b7da2f195d",
        "printing_id": "6176b1d7-f194-4edb-a627-c0a73fa04f5b",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ホロン遺跡",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "b5d8ad8f-2616-4660-84ed-24126636078c",
      "payload": {
        "id": "b5d8ad8f-2616-4660-84ed-24126636078c",
        "name": "ホロンエネルギーff",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:25:21.695669+00:00",
        "updated_at": "2026-08-06T21:25:21.695669+00:00",
        "variant_id": "95aa1d56-b97a-4c68-b669-f9e83e7af868",
        "printing_id": "cc1681cb-030e-4d1e-a144-d68ff927f111",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "ホロンエネルギーff",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "c88a676b-893f-4622-b441-7b5cdc315ef1",
      "payload": {
        "id": "c88a676b-893f-4622-b441-7b5cdc315ef1",
        "name": "ホロン研究者",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:25:14.573694+00:00",
        "updated_at": "2026-08-06T21:25:14.573694+00:00",
        "variant_id": "33542dbb-3aee-4441-bc34-15d6c1743acc",
        "printing_id": "7734f437-9514-4c5a-ace5-7359a60216ad",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "ホロン研究者",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "cf2b51f6-bb44-4083-9aa3-86a814fc43f3",
      "payload": {
        "id": "cf2b51f6-bb44-4083-9aa3-86a814fc43f3",
        "name": "ホロンエネルギーwp",
        "name_type": "native",
        "created_at": "2026-08-06T21:25:22.415658+00:00",
        "updated_at": "2026-08-06T21:25:22.415658+00:00",
        "variant_id": "2a28827b-2cfe-49e6-ae63-c300c08798e6",
        "printing_id": "335d5820-4616-49be-89ff-5c8f494e1940",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ホロンエネルギーwp",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "d0deb8fe-c60f-4f7a-a005-46142d6a3ce7",
      "payload": {
        "id": "d0deb8fe-c60f-4f7a-a005-46142d6a3ce7",
        "name": "ドロージー",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:24:22.942709+00:00",
        "updated_at": "2026-08-06T21:24:22.942709+00:00",
        "variant_id": "32577dac-0959-40b9-9eb6-879c52dd3c93",
        "printing_id": "fc9ae1df-0f27-470e-a866-3178f51b68c4",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "ドロージー",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "ea8fc159-db90-4b65-b551-2773d6556d7b",
      "payload": {
        "id": "ea8fc159-db90-4b65-b551-2773d6556d7b",
        "name": "ドロージー",
        "name_type": "native",
        "created_at": "2026-08-06T21:24:21.754485+00:00",
        "updated_at": "2026-08-06T21:24:21.754485+00:00",
        "variant_id": "32577dac-0959-40b9-9eb6-879c52dd3c93",
        "printing_id": "fc9ae1df-0f27-470e-a866-3178f51b68c4",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ドロージー",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "f20e7819-08ca-4cf9-bcc9-47767acfa40e",
      "payload": {
        "id": "f20e7819-08ca-4cf9-bcc9-47767acfa40e",
        "name": "サラメンス（デルタ種）",
        "name_type": "english_display",
        "created_at": "2026-08-06T12:51:58.099951+00:00",
        "updated_at": "2026-08-06T12:51:58.099951+00:00",
        "variant_id": "6451b1a6-b023-402b-822f-3409512df5d9",
        "printing_id": "bcb2a732-f043-4eac-a767-6515f1c5408d",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "サラメンス(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "f2905231-51df-4f69-8caf-bd8d877494ee",
      "payload": {
        "id": "f2905231-51df-4f69-8caf-bd8d877494ee",
        "name": "ホロン遺跡",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:25:22.026883+00:00",
        "updated_at": "2026-08-06T21:25:22.026883+00:00",
        "variant_id": "0379b17a-5e24-4caa-85dd-48b7da2f195d",
        "printing_id": "6176b1d7-f194-4edb-a627-c0a73fa04f5b",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "ホロン遺跡",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "f9590c83-175c-4b80-b025-1b98152dd1c7",
      "payload": {
        "id": "f9590c83-175c-4b80-b025-1b98152dd1c7",
        "name": "ホロンエネルギーwp",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:25:22.853642+00:00",
        "updated_at": "2026-08-06T21:25:22.853642+00:00",
        "variant_id": "2a28827b-2cfe-49e6-ae63-c300c08798e6",
        "printing_id": "335d5820-4616-49be-89ff-5c8f494e1940",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "ホロンエネルギーwp",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "ff90b3a5-e7d1-4160-884c-55af2b85f046",
      "payload": {
        "id": "ff90b3a5-e7d1-4160-884c-55af2b85f046",
        "name": "同上",
        "name_type": "native",
        "created_at": "2026-08-06T10:39:56.421857+00:00",
        "updated_at": "2026-08-06T10:39:56.421857+00:00",
        "variant_id": "19dfe7aa-93aa-44df-9bb2-2b41ff800a4e",
        "printing_id": "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "同上",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "printings",
      "identity": "335d5820-4616-49be-89ff-5c8f494e1940",
      "payload": {
        "id": "335d5820-4616-49be-89ff-5c8f494e1940",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:25:21.404374+00:00",
        "updated_at": "2026-08-31T04:33:15.881422+00:00",
        "native_name": "ホロンエネルギーwp",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "e460ca25-9420-48d1-823c-1c4606a74ada",
        "discontinued_at": null,
        "collector_number": "086",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 86,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000086"
      }
    },
    {
      "scope": "printings",
      "identity": "6176b1d7-f194-4edb-a627-c0a73fa04f5b",
      "payload": {
        "id": "6176b1d7-f194-4edb-a627-c0a73fa04f5b",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:25:17.949794+00:00",
        "updated_at": "2026-08-31T04:33:14.880138+00:00",
        "native_name": "ホロン遺跡",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "bcd305b9-b3ce-453f-ba3c-09d04a589af4",
        "discontinued_at": null,
        "collector_number": "083",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 83,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000083"
      }
    },
    {
      "scope": "printings",
      "identity": "701a96ec-0100-41ea-b324-b6adc450fb2f",
      "payload": {
        "id": "701a96ec-0100-41ea-b324-b6adc450fb2f",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "bed84eca-bf58-47d5-94db-3714d513b38f",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:24:56.327909+00:00",
        "updated_at": "2026-08-31T04:33:10.434202+00:00",
        "native_name": "マイティエナ（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "e8c0e5eb-95b4-45e4-8f6c-38dfa26e5c4f",
        "discontinued_at": null,
        "collector_number": "070",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 70,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000070"
      }
    },
    {
      "scope": "printings",
      "identity": "7734f437-9514-4c5a-ace5-7359a60216ad",
      "payload": {
        "id": "7734f437-9514-4c5a-ace5-7359a60216ad",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:25:09.173732+00:00",
        "updated_at": "2026-08-31T04:33:10.893075+00:00",
        "native_name": "ホロン研究者",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "edb21ee8-99c1-45b5-8e4d-6d00ecb78041",
        "discontinued_at": null,
        "collector_number": "078",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 78,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000078"
      }
    },
    {
      "scope": "printings",
      "identity": "bafca88a-6810-411a-8a1f-ca250618a502",
      "payload": {
        "id": "bafca88a-6810-411a-8a1f-ca250618a502",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:25:13.75032+00:00",
        "updated_at": "2026-08-31T04:33:11.382159+00:00",
        "native_name": "ホロン農家",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "77ba482c-7b52-4de5-b41d-ce5c0e83dea0",
        "discontinued_at": null,
        "collector_number": "080",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 80,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000080"
      }
    },
    {
      "scope": "printings",
      "identity": "bcb2a732-f043-4eac-a767-6515f1c5408d",
      "payload": {
        "id": "bcb2a732-f043-4eac-a767-6515f1c5408d",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "bed84eca-bf58-47d5-94db-3714d513b38f",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T12:51:49.976249+00:00",
        "updated_at": "2026-08-31T04:32:54.538499+00:00",
        "native_name": "サラメンス（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "ca249fb2-1bc6-4ddb-ba4b-607dc6de87de",
        "discontinued_at": null,
        "collector_number": "021",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 21,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000021"
      }
    },
    {
      "scope": "printings",
      "identity": "cc1681cb-030e-4d1e-a144-d68ff927f111",
      "payload": {
        "id": "cc1681cb-030e-4d1e-a144-d68ff927f111",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:25:18.122045+00:00",
        "updated_at": "2026-08-31T04:33:15.406997+00:00",
        "native_name": "ホロンエネルギーff",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "47cb96b6-774a-42b5-8a7b-fe91292a57f1",
        "discontinued_at": null,
        "collector_number": "085",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 85,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000085"
      }
    },
    {
      "scope": "printings",
      "identity": "faebe598-d6b1-4240-bcee-ba9dddf47bca",
      "payload": {
        "id": "faebe598-d6b1-4240-bcee-ba9dddf47bca",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "bed84eca-bf58-47d5-94db-3714d513b38f",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T12:48:32.692743+00:00",
        "updated_at": "2026-08-31T04:32:54.205275+00:00",
        "native_name": "ティラニター（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "ec548df0-d648-41e6-b42a-1036924914f2",
        "discontinued_at": null,
        "collector_number": "020",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 20,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000020"
      }
    },
    {
      "scope": "printings",
      "identity": "fc9ae1df-0f27-470e-a866-3178f51b68c4",
      "payload": {
        "id": "fc9ae1df-0f27-470e-a866-3178f51b68c4",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "d3aeeb9c-841e-4088-8fa8-bc4028b800de",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:24:20.525223+00:00",
        "updated_at": "2026-08-31T04:33:00.155148+00:00",
        "native_name": "ドロージー",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "1e287040-fa09-4792-b0eb-3483b0dbed72",
        "discontinued_at": null,
        "collector_number": "044",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 44,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000044"
      }
    },
    {
      "scope": "printings",
      "identity": "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d",
      "payload": {
        "id": "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d",
        "artist": null,
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "b92f9cd1-5e40-4b96-b021-49425d5f3b74",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T10:39:46.059952+00:00",
        "updated_at": "2026-08-31T04:32:49.42523+00:00",
        "native_name": "同上",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "1843a4e7-8672-4365-a920-a59e44f860d8",
        "discontinued_at": null,
        "collector_number": "007",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 7,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000007"
      }
    },
    {
      "scope": "sets",
      "identity": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
      "payload": {
        "id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "total": 86,
        "set_code": "PCG6",
        "game_code": "pokemon",
        "series_id": null,
        "created_at": "2026-08-05T13:48:53.986+00:00",
        "updated_at": "2026-08-31T04:08:47.07168+00:00",
        "native_name": "ホロンの研究塔",
        "region_code": null,
        "release_date": "2005-10-28",
        "deprecated_at": null,
        "display_order": null,
        "language_code": "ja",
        "printed_total": 86,
        "discontinued_at": null,
        "deprecated_reason": null,
        "provider_set_code": "PCG6",
        "source_updated_at": null,
        "corrected_by_set_id": null,
        "english_display_name": null
      }
    },
    {
      "scope": "variants",
      "identity": "0379b17a-5e24-4caa-85dd-48b7da2f195d",
      "payload": {
        "id": "0379b17a-5e24-4caa-85dd-48b7da2f195d",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:25:19.157+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:33:15.107778+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "6176b1d7-f194-4edb-a627-c0a73fa04f5b",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:083:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "083",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "19dfe7aa-93aa-44df-9bb2-2b41ff800a4e",
      "payload": {
        "id": "19dfe7aa-93aa-44df-9bb2-2b41ff800a4e",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T10:39:47.913323+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:32:49.741572+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "fd7f0bfc-d80b-411f-b4e4-00c4223b7c9d",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:007:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "007",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "2a28827b-2cfe-49e6-ae63-c300c08798e6",
      "payload": {
        "id": "2a28827b-2cfe-49e6-ae63-c300c08798e6",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:25:21.89318+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:33:16.113225+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "335d5820-4616-49be-89ff-5c8f494e1940",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:086:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "086",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "32577dac-0959-40b9-9eb6-879c52dd3c93",
      "payload": {
        "id": "32577dac-0959-40b9-9eb6-879c52dd3c93",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:24:20.990568+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:33:00.390219+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "fc9ae1df-0f27-470e-a866-3178f51b68c4",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:044:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "044",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "33542dbb-3aee-4441-bc34-15d6c1743acc",
      "payload": {
        "id": "33542dbb-3aee-4441-bc34-15d6c1743acc",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:25:11.086654+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:33:11.1422+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "7734f437-9514-4c5a-ace5-7359a60216ad",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:078:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "078",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "6451b1a6-b023-402b-822f-3409512df5d9",
      "payload": {
        "id": "6451b1a6-b023-402b-822f-3409512df5d9",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T12:51:52.105743+00:00",
        "is_default": false,
        "updated_at": "2026-08-31T04:32:54.825242+00:00",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "bcb2a732-f043-4eac-a767-6515f1c5408d",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:021:holo",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "021",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "71aa1bf4-7e11-4350-8c06-2b195e696a9f",
      "payload": {
        "id": "71aa1bf4-7e11-4350-8c06-2b195e696a9f",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T12:48:33.683331+00:00",
        "is_default": false,
        "updated_at": "2026-08-31T04:32:54.485201+00:00",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "faebe598-d6b1-4240-bcee-ba9dddf47bca",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:020:holo",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "020",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "88c960dd-5bb1-4ec4-a530-886f823a1cfb",
      "payload": {
        "id": "88c960dd-5bb1-4ec4-a530-886f823a1cfb",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:25:14.183753+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:33:11.606709+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "bafca88a-6810-411a-8a1f-ca250618a502",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:080:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "080",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "95aa1d56-b97a-4c68-b669-f9e83e7af868",
      "payload": {
        "id": "95aa1d56-b97a-4c68-b669-f9e83e7af868",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:25:19.158411+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:33:15.672671+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "cc1681cb-030e-4d1e-a144-d68ff927f111",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:085:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "085",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    },
    {
      "scope": "variants",
      "identity": "ccbaab4d-efdc-4110-b435-1ca275b2f58d",
      "payload": {
        "id": "ccbaab4d-efdc-4110-b435-1ca275b2f58d",
        "set_id": "8fdf462f-ca9c-47e7-a92d-1936b082a12d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:24:58.41745+00:00",
        "is_default": false,
        "updated_at": "2026-08-31T04:33:10.666859+00:00",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "701a96ec-0100-41ea-b324-b6adc450fb2f",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:8fdf462f-ca9c-47e7-a92d-1936b082a12d:070:holo",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "070",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null,
        "native_image_status": "scan_acquisition_required",
        "variant_display_name": null,
        "corrected_by_variant_id": null,
        "same_artwork_as_variant_id": null
      }
    }
  ]
};
function database(environment = 'production') {
  const state=Object.fromEntries(['printings','variants','names','sets','assets','links','sources'].map(scope=>[scope,clone(frozenBefore[environment].filter(r=>r.scope===scope).map(r=>r.payload))]));
  const calls = [];
  let saved, nextId = 0;
  const db = { state, calls, mutateAfterLinks: null, async query(sql, parameters = []) {
    calls.push(sql);
    if (sql.startsWith('begin')) { saved = clone(state); return { rows: [] }; }
    if (sql === 'rollback') { Object.assign(state, saved); return { rows: [] }; }
    if (sql.startsWith('set ') || sql.startsWith('select pg_advisory')) return { rows: [] };
    if (sql.startsWith('select game_code')) return { rows: clone(plan.binding_expectations[environment]) };
    if (sql.startsWith('select to_jsonb(source) as payload from ingest.sources')) return { rows: state.sources.map(source => ({ payload: clone(source) })) };
    if (sql.startsWith('select id from catalog.catalogue_versions')) return { rows: [{ id: environment === 'staging' ? STAGE_VERSION : VERSION }] };
    if (sql.startsWith('select id from catalog.assets where asset_type')) return { rows: state.assets.filter(asset => asset.asset_type === 'card_image').map(asset => ({ id: asset.id })) };
    if (sql.startsWith('select * from api.asset_manifest')) return { rows: state.assets.filter(asset => asset.asset_type === 'card_image').map(asset => ({ ...clone(asset), asset_row_id: asset.id })) };
    if (sql.startsWith('insert into ingest.sources')) {
      if (db.failSourceInsert) throw Error('Injected source insert failure');
      const source = { ...Object.fromEntries(['code', 'display_name', 'source_type', 'base_url', 'licence_status', 'attribution_required', 'active', 'internal_notes'].map((key, index) => [key, parameters[index]])), id:'cccccccc-cccc-4ccc-8ccc-000000000001', terms_url:null, robots_policy:null, rate_limit_config:{}, source_updated_at:null, deprecated_at:null, deprecated_reason:null, created_at:'2026-10-15T19:45:00.123456+00:00', updated_at:'2026-10-15T19:45:00.123456+00:00' };
      if (db.concurrentSourceOnInsert) { state.sources.push(source); return {rows:[]}; }
      if (state.sources.some(item=>item.code===source.code)) return {rows:[]};
      state.sources.push(source);const returned=clone(source);db.mutateAfterSourceInsert?.(source);return {rows:[{payload:returned}]};
    }
    if (sql.startsWith('insert into catalog.assets')) {
      const inserted = [];
      for (const data of JSON.parse(parameters[0])) if (!state.assets.some(asset => asset.asset_id === data.asset_id)) {
        const id = `bbbbbbbb-bbbb-4bbb-8bbb-${String(++nextId).padStart(12, '0')}`;
        state.assets.push({ ...data, id }); inserted.push({ id });
      }
      return { rows: inserted };
    }
    if (sql.startsWith('insert into catalog.catalogue_version_assets')) {
      if (db.failLinkInsert) throw Error('Injected link write failure');
      const inserted = [];
      for (const data of JSON.parse(parameters[0])) if (!state.links.some(link => link.asset_id === data.asset_id && link.catalogue_version_id === data.catalogue_version_id)) { state.links.push(data); inserted.push(data); }
      db.mutateAfterLinks?.(state);
      return { rows: clone(inserted) };
    }
    if (sql.startsWith('select * from catalog.assets where asset_id')) return { rows: clone(state.assets.filter(asset => parameters[0].includes(asset.asset_id))) };
    for (const [table, scope] of [['catalog.card_printings', 'printings'], ['catalog.card_variants', 'variants'], ['catalog.card_names', 'names'], ['catalog.sets', 'sets'], ['catalog.assets', 'assets'], ['catalog.catalogue_version_assets', 'links'], ['ingest.sources', 'sources']]) if (sql.startsWith(`select to_jsonb(scoped) as payload from ${table} scoped where`)) {
      const result = clone(state[scope]);
      // Model pg's direct-column timestamp parsing so a second unsafe source
      // reader cannot pass only because the fixture stored JSON strings.
      if (scope === 'sources') for (const source of result) for (const key of ['created_at', 'updated_at', 'deprecated_at', 'source_updated_at']) if (source[key]) source[key] = new Date(source[key]);
      return { rows: result.map(payload => ({payload})) };
    }
    throw Error(`Unexpected test SQL: ${sql}`);
  } };
  return db;
}



async function guardedPlan(db,env='production'){
 const p=clone(plan),snapshot=await readSnapshot(db,rows,p.scope_counts[env]);p.before_snapshot_hashes[env]=snapshotHash(snapshot);
 assert.equal(snapshot.length,env==='production'?47:41);return p;
}
test('exact ten PCG6 null catalogue values and seven normal/three holo defaults',()=>{validateRows(plan,table);assert.equal(rows.length,10);assert.deepEqual(rows.map(r=>knownSource(r.printing_id).defaultFlag),[true,false,false,true,false,true,true,true,true,true]);for(const r of rows){validatePublishedWitness(r.evidence.source_body,r);assert.equal(r.evidence.source_body.accepted_category,null);assert.equal(r.evidence.source_body.recorded_inventory_category,null);}});

test('direct raw observations and independent root readings reject wrapper and joint hash forgeries',()=>{
 for(let i=0;i<10;i++)for(const change of [
  b=>{b.raw_source_printed_witness.printedNativeName='wrong';},
  b=>{b.root_actual_printed_witness.printedRules='truncated';b.actual_pixel_signature.printedRules='truncated';},
  b=>{b.actual_pixel_signature={actualPrintedObservations:b.actual_pixel_signature};},
  b=>{b.actual_pixel_signature_schema='WRAPPED';},
  b=>{b.raw_source_witness_is_verbatim_certified=true;},
  b=>{b.raw_source_historical_flags.preparationApproved=true;}
 ]){const q=clone(rows[i]),b=q.evidence.source_body;change(b);b.raw_source_printed_witness_canonical_sha256=canonicalHash(b.raw_source_printed_witness);b.root_actual_printed_witness_canonical_sha256=canonicalHash(b.root_actual_printed_witness);b.actual_pixel_signature_canonical_sha256=canonicalHash(b.actual_pixel_signature);q.evidence.queue_controls=clone(b.queue_controls);assert.throws(()=>validatePublishedWitness(b,q));const p=clone(plan),t=clone(table);p.rows[i]=q;t[i].evidence_sha256=canonicalHash(q.evidence);assert.throws(()=>validateRows(p,t));}
});
test('finite085086 Energy retain native Trainer/currentcategoryNULL and full exrestriction',()=>{for(const i of [8,9]){const b=rows[i].evidence.source_body,a=b.actual_pixel_signature;assert.equal(a.printedCardClass,'Energy');assert.equal(b.actual_native_category,'Trainer');assert.equal(b.accepted_category,null);assert.equal(b.finite_energy_exception,true);assert(a.printedRules.includes('ポケモンex'));for(const mutate of [b=>b.actual_pixel_signature.printedRules='truncated',b=>b.finite_energy_exception=false,b=>b.actual_native_category='Energy',b=>b.global_trainer_energy_guard_changed=true,b=>b.raw_historical_source_holds=[]]){const q=clone(rows[i]);mutate(q.evidence.source_body);assert.throws(()=>validatePublishedWitness(q.evidence.source_body,q));}}for(const r of rows.slice(0,8)){const q=clone(r);q.evidence.source_body.finite_energy_exception=true;assert.throws(()=>validatePublishedWitness(q.evidence.source_body,q));}});

test('joint body, scope, default and source forgeries fail even when witness hashes are recomputed',()=>{
 const changes=[r=>{r.language_code='en';},r=>{r.set_code='PCG9';},r=>{r.provider_id='pricecharting:'+knownSource(r.printing_id).productId;},r=>{r.work_type='SHARP';},r=>{r.evidence.asset_variant_id=r.variant_ids[0];},r=>{r.evidence.source_body.accepted_category='Pokemon';},r=>{r.evidence.source_body.actual_printed_ability_logo='wrong';},r=>{r.evidence.source_body.raw_source_witness_not_rewritten=false;},r=>{r.evidence.source_body.actual_pixel_signature.printedNonCollectorIdentifier='No.1';},r=>{r.evidence.source_body.actual_pixel_signature.printedForm='delta';},r=>{const a=r.evidence.source_body.actual_pixel_signature;if(a.attacks.length)a.attacks[0].effect='truncated';else a.printedRules='truncated';},r=>{r.evidence.source_body.actual_pixel_signature.printedPokemonExRule='truncated';},r=>{r.evidence.source_body.actual_pixel_signature.printedNationalDex=1;},r=>{r.evidence.source_body.actual_pixel_signature.printedSetCodeLiteral='PCG6';},r=>{r.evidence.source_body.required_asset_scope.printing_id='wrong';},r=>{r.evidence.source_body.photo_identity_projection.canonicalPrintingId='wrong';},r=>{r.evidence.source_body.current_production_binding.variants[0].is_default=!knownSource(r.printing_id).defaultFlag;},r=>{r.evidence.source_body.current_staging_binding.variants[0].finish_code='first_edition';},r=>{r.evidence.source_body.physical_material_authenticity_verified=true;},r=>{r.evidence.source_body.unlimited_edition_certified=true;},r=>{r.evidence.source_body.vendor_licence_certified=true;},r=>{r.evidence.source_body.source_wide_approval=true;},r=>{r.evidence.source_body.native_optical_gain_claimed=true;},r=>{r.evidence.source_body.provider_metadata_raw={sellerPrices:[12]};},r=>{r.objects[0].sha256='0'.repeat(64);},r=>{r.objects[3].height=9999;}];
 for(let i=0;i<10;i++)for(const mutate of changes){const p=clone(plan),t=clone(table);mutate(p.rows[i]);p.rows[i].evidence.source_body.actual_pixel_signature_canonical_sha256=canonicalHash(p.rows[i].evidence.source_body.actual_pixel_signature);t[i].evidence_sha256=canonicalHash(p.rows[i].evidence);assert.throws(()=>validateRows(p,t));if(canonicalHash(p.rows[i].evidence.source_body)!==canonicalHash(rows[i].evidence.source_body))assert.throws(()=>validatePublishedWitness(p.rows[i].evidence.source_body,p.rows[i]));}
});
test('plan/approval bytes and duplicate front scopes remain closed',async()=>{
 const bytes=await readFile(new URL('./plan.json',import.meta.url));assert.throws(()=>validatePlan(Buffer.concat([bytes,Buffer.from(' ')]),table));
 const a=clone(approval);a.approved=false;assert.throws(()=>validateApproval(Buffer.from(JSON.stringify(a))));
 const p=clone(plan);p.rows.push(clone(p.rows[0]));assert.throws(()=>validateRows(p,table));
});
test('all68 existing source fields and microseconds, including initial Price finite2 notes, are immutable',()=>{
 assertSourcePolicies(plan,clone(oldSources),'production');assert.equal(oldSources.length,4);assert.ok(oldSources.every(source=>Object.keys(source).length===17));
 for(const source of oldSources)for(const field of Object.keys(source)){const sources=clone(oldSources);sources.find(row=>row.code===source.code)[field]='changed';assert.throws(()=>assertSourcePolicies(plan,sources,'production'));}
 const changed=clone(oldSources);changed.find(source=>source.code==='pricecharting').created_at=new Date(changed.find(source=>source.code==='pricecharting').created_at);assert.throws(()=>assertSourcePolicies(plan,changed,'production'));
});
test('production source creation/policy edits and extra stage fixtures cannot be authorised',()=>{
 for(const mutate of [p=>{p.new_sources.production=[p.new_sources.staging[0]];},p=>{p.production_source_changes_allowed=1;},p=>{p.source_policies.production.find(source=>source.code==='pricecharting').active=true;},p=>{p.source_policies.production.find(source=>source.code==='pricecharting').internal_notes+=' finite1 revised';},p=>{p.new_sources.staging.push(p.source_policies.production[0]);},p=>{p.source_policies.staging.push(p.source_policies.production[0]);}]){const p=clone(plan);mutate(p);assert.throws(()=>createSourceResolver(p));}
});
test('both readers retain all four JSON source rows and domain aliases while production executes zero inserts',async()=>{
 const db=database();const snapshot=await readSnapshot(db,rows,plan.scope_counts.production);
 for(const source of oldSources)assert.deepEqual(snapshot.find(row=>row.scope==='sources'&&row.payload.code===source.code).payload,source);
 db.failSourceInsert=true;const map=await createSourceResolver(plan)(db,receipt,'production');assert.equal(map.size,4);assert.ok(map.has('pricecharting'));
 assert.ok(!db.calls.some(sql=>sql.startsWith('insert into ingest.sources')||sql.startsWith('select * from ingest.sources')));
 assert.ok(db.calls.filter(sql=>sql.startsWith('select to_jsonb(source)')).every(sql=>sql.includes('lower(code)')&&sql.includes('limit 5')&&sql.includes('base_url ilike')));
});
test('missing Price, missing unrelated source and domain aliases fail without creating/adopting rows',async()=>{
 for(const code of ['pricecharting','scrydex','pokellector','tcgcollector']){const db=database();db.state.sources=db.state.sources.filter(source=>source.code!==code);await assert.rejects(createSourceResolver(plan)(db,receipt,'production'));assert.ok(!db.calls.some(sql=>sql.startsWith('insert')));}
 const db=database();db.state.sources.push({...clone(oldSources[0]),id:'other',code:'alternate',base_url:'https://pricecharting.com/alias'});await assert.rejects(createSourceResolver(plan)(db,receipt,'production'));assert.ok(!db.calls.some(sql=>sql.startsWith('insert')));
});
test('production47→67 adds exactly ten printing-shared assets/links and preserves all four sources',async()=>{
 const db=database(),initial=clone(db.state),p=await guardedPlan(db),j=journal();db.failSourceInsert=true;
 await writeMetadata(db,rows,receipt,approval,'production',j,createSourceResolver(p),null,null,createMetadataGuard(p));
 assert.equal(j.assets.length,10);assert.equal(j.links.length,10);assert.equal(j.preservation.new_inactive_provenance_sources,0);assert.deepEqual(j.preservation.created_provenance_sources,[]);
 assert.equal(Object.values(j.preservation.before_counts).reduce((a,b)=>a+b,0),47);assert.equal(Object.values(j.preservation.after_counts).reduce((a,b)=>a+b,0),67);
 assert.deepEqual(db.state.sources,initial.sources);for(const scope of ['printings','variants','names','sets'])assert.deepEqual(db.state[scope],initial[scope]);assert.deepEqual(db.state.assets.slice(0,initial.assets.length),initial.assets);assert.deepEqual(db.state.links.slice(0,initial.links.length),initial.links);
 assert.equal(db.state.assets.find(asset=>asset.asset_type==='card_image').variant_id,null);assert.equal(j.links[0].variant_id,null);
 assert.ok(!db.calls.some(sql=>sql.startsWith('insert into ingest.sources')));
 await assert.rejects(writeMetadata(db,rows,receipt,approval,'production',journal(),createSourceResolver(p),null,null,createMetadataGuard(p)),/before snapshot changed/);
});
test('zero-source staging creates only a temporary Price fixture and returns41 unchanged rows',async()=>{
 const db=database('staging'),initial=clone(db.state),p=await guardedPlan(db,'staging'),j=journal();
 assert.equal(db.state.sources.length,0);assert.ok(db.state.printings.every(printing=>!Object.hasOwn(printing,'printing_discriminator')));
 await rehearse(db,()=>writeMetadata(db,rows,receipt,approval,'staging',j,createSourceResolver(p),null,null,createMetadataGuard(p)));
 assert.equal(j.preservation.staging_fixture_sources,1);assert.equal(j.preservation.created_provenance_sources[0].code,'pricecharting');assert.equal(j.assets.length,10);assert.equal(j.links.length,10);
 assert.equal(Object.values(j.preservation.before_counts).reduce((a,b)=>a+b,0),41);assert.equal(Object.values(j.preservation.after_counts).reduce((a,b)=>a+b,0),62);assert.deepEqual(db.state,initial);
});
test('canonical/old asset/link/source drift is rejected before inserts and post-write drift rolls back',async()=>{
 for(const mutate of [s=>{s.printings[0].native_name='changed';},s=>{s.variants[0].finish_code='first_edition';},s=>{s.names[0].name='changed';},s=>{s.assets.push({id:'unexpected',storage_key:'changed'});},s=>{s.links.push({asset_id:'unexpected',catalogue_version_id:'unexpected',asset_type:'changed'});},s=>{s.sources[0].updated_at='2026-10-15T21:26:03.082847+00:00';}]){
  const db=database(),p=await guardedPlan(db);mutate(db.state);await assert.rejects(writeMetadata(db,rows,receipt,approval,'production',journal(),createSourceResolver(p),null,null,createMetadataGuard(p)),/before snapshot changed/);assert.ok(!db.calls.some(sql=>sql.startsWith('insert')));
  const after=database(),q=await guardedPlan(after),initial=clone(after.state);after.mutateAfterLinks=mutate;await assert.rejects(rehearse(after,()=>writeMetadata(after,rows,receipt,approval,'production',journal(),createSourceResolver(q),null,null,createMetadataGuard(q))));assert.deepEqual(after.state,initial);
 }
});
test('stage fixture defaults, concurrent creation and reread drift fail closed',async()=>{
 for(const mutate of [s=>{s.terms_url='unplanned';},s=>{s.rate_limit_config={limit:1};},s=>{s.extra='field';},s=>{s.updated_at='2026-10-15T19:45:00.123457+00:00';}]){const db=database('staging');db.mutateAfterSourceInsert=mutate;await assert.rejects(createSourceResolver(plan)(db,receipt,'staging'));}
 const db=database('staging');db.concurrentSourceOnInsert=true;await assert.rejects(createSourceResolver(plan)(db,receipt,'staging'),/concurrent/);
 const changed=database('staging');changed.mutateAfterSourceInsert=s=>{s.created_at=s.updated_at='2026-10-15T19:45:00.123457+00:00';};await assert.rejects(createSourceResolver(plan)(changed,receipt,'staging'),/changed before resolver/);
});
test('source and link write failures roll back without changing existing policies or leaving a fixture',async()=>{
 for(const[env,flag]of [['staging','failSourceInsert'],['staging','failLinkInsert'],['production','failLinkInsert']]){const db=database(env),p=await guardedPlan(db,env),initial=clone(db.state);db[flag]=true;await assert.rejects(rehearse(db,()=>writeMetadata(db,rows,receipt,approval,env,journal(),createSourceResolver(p),null,null,createMetadataGuard(p))),/Injected/);assert.deepEqual(db.state,initial);}
});
test('rollback hides only this successful shared asset and retains all provenance and immutable data',()=>{
 const success={...journal(),status:'published_manifest_and_public_bytes_verified',revision:'a'.repeat(40),verified_at:'2026-10-15',preservation:{created_provenance_sources:[]},assets:rows.map((r,i)=>({id:'bbbbbbbb-bbbb-4bbb-8bbb-'+String(i+1).padStart(12,'0'),printing_id:r.printing_id,created:true}))};
 const result=rollbackReceipt(success,plan),sql=rollbackSql(result);assert.equal(result.assets.length,10);for(let i=0;i<10;i++)assert.equal(result.assets[i].asset_id,assetId(rows[i]));assert.deepEqual(result.retained_inactive_provenance_sources,[]);assert.ok(sql.includes(COHORT_SHA)&&sql.includes('a.variant_id IS NULL'));assert.ok(!sql.includes('DELETE')&&!sql.includes('UPDATE ingest.sources'));
 assert.throws(()=>rollbackReceipt({...success,preservation:{created_provenance_sources:[{code:'pricecharting'}]}},plan));assert.throws(()=>rollbackReceipt({...success,status:'commit_outcome_unknown'},plan));
});
test('protected exact-main confirmation and separated private-output gates remain enforced',()=>{
 const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),STACKR_EXPECTED_MAIN_SHA:'a'.repeat(40),STACKR_ARTWORK_PCG6_WAVES008009010_TEN_FRONTS_CONFIRMATION:'PUBLISH ARTWORK PCG6 WAVES008009010 TEN FRONTS',STACKR_ARTWORK_PCG6_WAVES008009010_TEN_FRONTS_PACKAGES:'/packages',STACKR_ARTWORK_PCG6_WAVES008009010_TEN_FRONTS_OUTPUT:'/public',SUPABASE_STAGING_DB_URL:'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres',SUPABASE_DB_URL:'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres'};
 assertConfig(env);for(const mutate of [e=>{e.GITHUB_REF='refs/heads/other';},e=>{e.GITHUB_EVENT_NAME='push';},e=>{e.STACKR_EXPECTED_MAIN_SHA='b'.repeat(40);},e=>{e.STACKR_ARTWORK_PCG6_WAVES008009010_TEN_FRONTS_CONFIRMATION='wrong';},e=>{e.STACKR_ARTWORK_PCG6_WAVES008009010_TEN_FRONTS_PRIVATE_OUTPUT='/public/private';}]){const changed={...env};mutate(changed);assert.throws(()=>assertConfig(changed));}
});
test('public body rejects commercial captures/private paths and retains exact accepted Japanese witness',()=>{
 for(const value of [{prices:[]},{sellerPrices:[]},{provider_metadata_raw:{}},{file:'D:/private/raw.html'}])assert.throws(()=>publicProjection(value));assert.deepEqual(publicProjection(rows[0].evidence.source_body),rows[0].evidence.source_body);
});

test('existing PCG6 logo/link and all sevennormal/threeholo defaults survive metadata writes and rollback',async()=>{
 for(const env of ['production','staging']){const db=database(env),initial=clone(db.state),p=await guardedPlan(db,env),j=journal();const apply=()=>writeMetadata(db,rows,receipt,approval,env,j,createSourceResolver(p),null,null,createMetadataGuard(p));assert.ok(db.state.variants.every(v=>v.is_default===knownSource(v.printing_id).defaultFlag));if(env==='production'){await apply();assert.deepEqual(db.state.assets.slice(0,initial.assets.length),initial.assets);assert.deepEqual(db.state.links.slice(0,initial.links.length),initial.links);assert.deepEqual(db.state.variants,initial.variants);}else{await rehearse(db,apply);assert.deepEqual(db.state,initial);}}
 for(let i=0;i<10;i++){const db=database(),p=await guardedPlan(db);db.state.variants[i].is_default=!db.state.variants[i].is_default;await assert.rejects(writeMetadata(db,rows,receipt,approval,'production',journal(),createSourceResolver(p),null,null,createMetadataGuard(p)),/before snapshot changed/);assert.ok(!db.calls.some(sql=>sql.startsWith('insert')));}
});
test('all ten measured LARGE roles are detail pages, with honest original4/detail3 canvas signals',()=>{assert.deepEqual(plan.app_display_expectation.map(e=>e.large_role),Array(10).fill('detail-page'));assert.equal(rows.filter(r=>knownSource(r.printing_id).sourceHDCanvasSignal).length,4);assert.equal(rows.filter(r=>knownSource(r.printing_id).detailHDCanvasSignal).length,3);const p=clone(plan);p.app_display_expectation[0].large_role='original';assert.throws(()=>validateRows(p,table));for(const r of rows)for(const key of ['native_optical_gain_claimed','provider_native_resolution_certified','physical_finish_certified','vendor_licence_certified']){const q=clone(r);q.evidence.source_body[key]=true;assert.throws(()=>validatePublishedWitness(q.evidence.source_body,q));}});

test('actual full47/41 before fixtures equal frozen production/stage hashes without mock normalisation',async()=>{for(const env of ['production','staging']){const db=database(env),snapshot=await readSnapshot(db,rows,plan.scope_counts[env]);assert.equal(snapshot.length,plan.before_snapshot_counts[env]);assert.equal(snapshotHash(snapshot),plan.before_snapshot_hashes[env]);const j=journal(),initial=clone(db.state);await rehearse(db,()=>writeMetadata(db,rows,receipt,approval,env,j,createSourceResolver(plan),null,null,createMetadataGuard(plan)));assert.deepEqual(db.state,initial);assert.equal(j.preservation.created_assets,10);assert.equal(j.preservation.created_links,10);}});

const reorder=value=>Object.fromEntries(Object.entries(value).reverse());
const ins=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
for(const r of rows)for(const key of ['raw_source_printed_witness','root_actual_printed_witness','actual_pixel_signature']){
 test('reject stale and recomputed insertion order '+r.collector_number+' '+key,()=>{for(const recompute of [false,true]){const q=clone(r);q.evidence.source_body[key]=reorder(q.evidence.source_body[key]);if(recompute)q.evidence.source_body.raw_source_witness_insertion_sha256=ins(q.evidence.source_body[key]);assert.throws(()=>validatePublishedWitness(q.evidence.source_body,q));}});
 const witness=r.evidence.source_body[key];if(witness.attacks.length)test('reject nested attack field order '+r.collector_number+' '+key,()=>{const q=clone(r);q.evidence.source_body[key].attacks[0]=reorder(q.evidence.source_body[key].attacks[0]);assert.throws(()=>validatePublishedWitness(q.evidence.source_body,q));});
}
test('valid JSON parse, clone and independent body copies retain exact witness order',()=>{for(const r of rows)for(const copy of [JSON.parse(JSON.stringify(r)),clone(r)])validatePublishedWitness(copy.evidence.source_body,copy);});
test('separate corrected v2 validator and external binding remain mandatory frozen inputs',async()=>{const input=JSON.parse(await readFile(new URL('./freeze-inputs.json',import.meta.url)));assert.equal(input.source_evidence.privateSourceContractModuleFileByteSha256,'8d234aae1a181aa47da915f71d3091ffed8237f56295b5cf298daa341157c479');assert.equal(input.source_evidence.v2ExternalValidatorBindingFileByteSha256,'e5ea926d9fc6ef91bfcf94b998800ce2a6d1f659c2a373982344f9b4722c9a35');assert.equal(input.source_evidence.unchangedArchiveDoesNotAloneProveCorrectedValidator,true);for(const suffix of ['/pcg6-source-contract.mjs','/v2-validator-contract-binding.json'])assert(input.private_inputs.some(p=>p.file.endsWith(suffix)));});

test('rollback refuses partial, duplicate and unrelated success journals',()=>{const success={...journal(),status:'published_manifest_and_public_bytes_verified',revision:'a'.repeat(40),verified_at:'2026-10-16',preservation:{created_provenance_sources:[]},assets:rows.map((r,i)=>({id:'bbbbbbbb-bbbb-4bbb-8bbb-'+String(i+1).padStart(12,'0'),printing_id:r.printing_id,created:true}))};for(const mutate of [j=>j.assets.pop(),j=>j.assets[1]={...j.assets[0]},j=>j.assets[0].printing_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',j=>j.assets[0].id='bad',j=>j.assets[0].created=false]){const j=clone(success);mutate(j);assert.throws(()=>rollbackReceipt(j,plan));}});
