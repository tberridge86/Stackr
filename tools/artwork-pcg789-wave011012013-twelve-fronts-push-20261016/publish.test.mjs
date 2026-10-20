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
const journal=()=>({assets:[],links:[],metadata_changes:0});
const frozenBefore={
  "production": [
    {
      "scope": "assets",
      "identity": "a8aff0e7-96e1-4ccb-9403-ebbce7a94efd",
      "payload": {
        "id": "a8aff0e7-96e1-4ccb-9403-ebbce7a94efd",
        "url": "https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/set_logo/reviewed/catalogue/b5ef438a-ddcb-4093-8c9b-572639565af5/6f834a0c1aed38b3d45ea150f47ae9c740cf0028ab6157cfd4a8614e208cf99b/delivery.png",
        "width": 2155,
        "height": 730,
        "set_id": "b5ef438a-ddcb-4093-8c9b-572639565af5",
        "sha256": "6f834a0c1aed38b3d45ea150f47ae9c740cf0028ab6157cfd4a8614e208cf99b",
        "asset_id": "reviewed:set-logo:b5ef438a-ddcb-4093-8c9b-572639565af5:6f834a0c1aed38b3d45ea150f47ae9c740cf0028ab6157cfd4a8614e208cf99b",
        "byte_size": 760748,
        "game_code": "pokemon",
        "mime_type": "image/png",
        "source_id": "a23954d2-49ca-4f2e-8cee-ed628e179006",
        "asset_type": "set_logo",
        "created_at": "2026-10-09T14:57:11.89612+00:00",
        "deleted_at": null,
        "updated_at": "2026-10-09T14:57:11.89612+00:00",
        "variant_id": null,
        "printing_id": null,
        "storage_key": "public/set_logo/reviewed/catalogue/b5ef438a-ddcb-4093-8c9b-572639565af5/6f834a0c1aed38b3d45ea150f47ae9c740cf0028ab6157cfd4a8614e208cf99b/delivery.png",
        "storage_path": "public/set_logo/reviewed/catalogue/b5ef438a-ddcb-4093-8c9b-572639565af5/6f834a0c1aed38b3d45ea150f47ae9c740cf0028ab6157cfd4a8614e208cf99b/delivery.png",
        "cache_control": "public, max-age=31536000, immutable",
        "deprecated_at": null,
        "rights_status": "approved",
        "content_sha256": "6f834a0c1aed38b3d45ea150f47ae9c740cf0028ab6157cfd4a8614e208cf99b",
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
        "licensing_review_notes": "{\"fallback\": false, \"aiAssisted\": false, \"approvedAt\": \"2026-10-09\", \"processing\": \"byte_preserved\", \"displayCrop\": null, \"matchMethod\": \"unique_exact_language_name\", \"sourceWidth\": 2155, \"sourceHeight\": 730, \"sourceSha256\": \"6f834a0c1aed38b3d45ea150f47ae9c740cf0028ab6157cfd4a8614e208cf99b\", \"representation\": \"source_logo\"}",
        "original_source_identifier": "stackr-reviewed-set-logo:fa00f9850fec1b829ab7fbb3b76f9233d95c04761d1ada301d21bf93038f0973",
        "recognition_reference_eligible": false
      }
    },
    {
      "scope": "assets",
      "identity": "cad2551b-762b-435a-96fc-83426d0f4acb",
      "payload": {
        "id": "cad2551b-762b-435a-96fc-83426d0f4acb",
        "url": "https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/set_logo/reviewed/catalogue/421a8323-4094-4c7f-8622-fb6af390becc/ef262543fe1bdf6b88d7a1fbfd31da49f6991bf6d236e6ea0cd54e79836f6d64/delivery.png",
        "width": 2047,
        "height": 480,
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "sha256": "ef262543fe1bdf6b88d7a1fbfd31da49f6991bf6d236e6ea0cd54e79836f6d64",
        "asset_id": "reviewed:set-logo:421a8323-4094-4c7f-8622-fb6af390becc:ef262543fe1bdf6b88d7a1fbfd31da49f6991bf6d236e6ea0cd54e79836f6d64",
        "byte_size": 1700662,
        "game_code": "pokemon",
        "mime_type": "image/png",
        "source_id": "a23954d2-49ca-4f2e-8cee-ed628e179006",
        "asset_type": "set_logo",
        "created_at": "2026-10-09T14:57:11.89612+00:00",
        "deleted_at": null,
        "updated_at": "2026-10-09T14:57:11.89612+00:00",
        "variant_id": null,
        "printing_id": null,
        "storage_key": "public/set_logo/reviewed/catalogue/421a8323-4094-4c7f-8622-fb6af390becc/ef262543fe1bdf6b88d7a1fbfd31da49f6991bf6d236e6ea0cd54e79836f6d64/delivery.png",
        "storage_path": "public/set_logo/reviewed/catalogue/421a8323-4094-4c7f-8622-fb6af390becc/ef262543fe1bdf6b88d7a1fbfd31da49f6991bf6d236e6ea0cd54e79836f6d64/delivery.png",
        "cache_control": "public, max-age=31536000, immutable",
        "deprecated_at": null,
        "rights_status": "approved",
        "content_sha256": "ef262543fe1bdf6b88d7a1fbfd31da49f6991bf6d236e6ea0cd54e79836f6d64",
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
        "source_attribution": "User-approved Stackr set presentation; source_logo; AI-assisted background isolation of the printed bottom package wordmark using built-in image_gen; transparent output; Japanese title, ruby and subtitle visually checked against the preserved photograph. Output dimensions are derivative dimensions, not a native HD original claim.",
        "unavailable_reason": null,
        "original_source_url": null,
        "archival_storage_key": null,
        "externally_referenced": false,
        "licensing_review_notes": "{\"fallback\": false, \"aiAssisted\": true, \"approvedAt\": \"2026-10-09\", \"processing\": \"AI-assisted background isolation of the printed bottom package wordmark using built-in image_gen; transparent output; Japanese title, ruby and subtitle visually checked against the preserved photograph. Output dimensions are derivative dimensions, not a native HD original claim.\", \"displayCrop\": {\"cropBounds\": [82, 158, 2129, 638], \"sourceWidth\": 2146, \"sourceHeight\": 733}, \"matchMethod\": \"recorded_canonical_id\", \"sourceWidth\": 2146, \"sourceHeight\": 733, \"sourceSha256\": \"32b389d2c67df72fc0b196ad92b32d18036f4e8344dcccb2b6baf57cfed98a30\", \"representation\": \"source_logo\"}",
        "original_source_identifier": "stackr-reviewed-set-logo:ff552fa346e8fba9001fe1bd5b838e2a9f5bf3faf44723985cc4365446008bd5",
        "recognition_reference_eligible": false
      }
    },
    {
      "scope": "assets",
      "identity": "d2ebf44e-226c-4aea-b211-ad2eb1893bce",
      "payload": {
        "id": "d2ebf44e-226c-4aea-b211-ad2eb1893bce",
        "url": "https://oakdbbzdqwurpjnoqhmu.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/set_logo/reviewed/catalogue/d832f428-8d51-4ac0-a3cf-a5d38bddb88d/4164e733c1a75fa82b301a038a63ec2e81f01ba870ce6abf37837fb7a03ea283/delivery.png",
        "width": 2172,
        "height": 724,
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "sha256": "4164e733c1a75fa82b301a038a63ec2e81f01ba870ce6abf37837fb7a03ea283",
        "asset_id": "reviewed:set-logo:d832f428-8d51-4ac0-a3cf-a5d38bddb88d:4164e733c1a75fa82b301a038a63ec2e81f01ba870ce6abf37837fb7a03ea283",
        "byte_size": 985376,
        "game_code": "pokemon",
        "mime_type": "image/png",
        "source_id": "a23954d2-49ca-4f2e-8cee-ed628e179006",
        "asset_type": "set_logo",
        "created_at": "2026-10-09T14:57:11.89612+00:00",
        "deleted_at": null,
        "updated_at": "2026-10-09T14:57:11.89612+00:00",
        "variant_id": null,
        "printing_id": null,
        "storage_key": "public/set_logo/reviewed/catalogue/d832f428-8d51-4ac0-a3cf-a5d38bddb88d/4164e733c1a75fa82b301a038a63ec2e81f01ba870ce6abf37837fb7a03ea283/delivery.png",
        "storage_path": "public/set_logo/reviewed/catalogue/d832f428-8d51-4ac0-a3cf-a5d38bddb88d/4164e733c1a75fa82b301a038a63ec2e81f01ba870ce6abf37837fb7a03ea283/delivery.png",
        "cache_control": "public, max-age=31536000, immutable",
        "deprecated_at": null,
        "rights_status": "approved",
        "content_sha256": "4164e733c1a75fa82b301a038a63ec2e81f01ba870ce6abf37837fb7a03ea283",
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
        "licensing_review_notes": "{\"fallback\": false, \"aiAssisted\": false, \"approvedAt\": \"2026-10-09\", \"processing\": \"byte_preserved\", \"displayCrop\": null, \"matchMethod\": \"unique_exact_language_name\", \"sourceWidth\": 2172, \"sourceHeight\": 724, \"sourceSha256\": \"4164e733c1a75fa82b301a038a63ec2e81f01ba870ce6abf37837fb7a03ea283\", \"representation\": \"source_logo\"}",
        "original_source_identifier": "stackr-reviewed-set-logo:57610995836728dbf65614370fed80f13aec46be223bcfa37788d05fe21f121a",
        "recognition_reference_eligible": false
      }
    },
    {
      "scope": "links",
      "identity": "1a23b7a7-c50e-4601-9180-a25c950d27ea:a8aff0e7-96e1-4ccb-9403-ebbce7a94efd",
      "payload": {
        "set_id": "b5ef438a-ddcb-4093-8c9b-572639565af5",
        "asset_id": "a8aff0e7-96e1-4ccb-9403-ebbce7a94efd",
        "asset_type": "set_logo",
        "created_at": "2026-10-09T14:57:11.89612+00:00",
        "variant_id": null,
        "printing_id": null,
        "language_code": "ja",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea"
      }
    },
    {
      "scope": "links",
      "identity": "1a23b7a7-c50e-4601-9180-a25c950d27ea:cad2551b-762b-435a-96fc-83426d0f4acb",
      "payload": {
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "asset_id": "cad2551b-762b-435a-96fc-83426d0f4acb",
        "asset_type": "set_logo",
        "created_at": "2026-10-09T14:57:11.89612+00:00",
        "variant_id": null,
        "printing_id": null,
        "language_code": "ja",
        "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea"
      }
    },
    {
      "scope": "links",
      "identity": "1a23b7a7-c50e-4601-9180-a25c950d27ea:d2ebf44e-226c-4aea-b211-ad2eb1893bce",
      "payload": {
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "asset_id": "d2ebf44e-226c-4aea-b211-ad2eb1893bce",
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
      "identity": "02c0af04-b13d-4ab3-a713-352a193d10c1",
      "payload": {
        "id": "02c0af04-b13d-4ab3-a713-352a193d10c1",
        "name": "Dewgong Delta Species",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:28:03.095+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "052ae4a3-808a-4626-90b1-a8947c6eee70",
        "printing_id": "73c8c54f-ca86-411d-bc34-437d6bbae88a",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "dewgong delta species",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "0759badf-1a1a-4b49-88e1-093ded6f0e77",
      "payload": {
        "id": "0759badf-1a1a-4b49-88e1-093ded6f0e77",
        "name": "デューゴン（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T21:28:01.968+00:00",
        "updated_at": "2026-08-06T21:28:01.968+00:00",
        "variant_id": "052ae4a3-808a-4626-90b1-a8947c6eee70",
        "printing_id": "73c8c54f-ca86-411d-bc34-437d6bbae88a",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "デューゴン(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "0b181918-c6d7-4b6c-9512-a673b83c07b1",
      "payload": {
        "id": "0b181918-c6d7-4b6c-9512-a673b83c07b1",
        "name": "メディチャム",
        "name_type": "native",
        "created_at": "2026-08-06T21:27:02.726+00:00",
        "updated_at": "2026-08-06T21:27:02.726+00:00",
        "variant_id": "eb6c6e73-dc4c-4a20-a83a-57071ad93969",
        "printing_id": "40c40f95-7df1-4153-9030-1871ccaf77cf",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "メディチャム",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "1828ac25-af51-4854-9115-5f8a2d0811cb",
      "payload": {
        "id": "1828ac25-af51-4854-9115-5f8a2d0811cb",
        "name": "Medicham",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:27:03.353+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "eb6c6e73-dc4c-4a20-a83a-57071ad93969",
        "printing_id": "40c40f95-7df1-4153-9030-1871ccaf77cf",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "medicham",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "1c5263c3-867f-476f-9405-2b90c4959151",
      "payload": {
        "id": "1c5263c3-867f-476f-9405-2b90c4959151",
        "name": "jigglypuff",
        "name_type": "native",
        "created_at": "2026-08-06T21:27:06.957+00:00",
        "updated_at": "2026-08-06T21:27:06.957+00:00",
        "variant_id": "c73b2587-431d-47e1-ac6f-654d5559532f",
        "printing_id": "65ce4679-d7b1-48b4-a747-2e18cf57847f",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "jigglypuff",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "29fedf47-adce-4c6e-995c-0acc8bf2403d",
      "payload": {
        "id": "29fedf47-adce-4c6e-995c-0acc8bf2403d",
        "name": "Armaldo Delta Species",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:26:04.047+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "c33e36aa-e537-49b8-b508-63064b097899",
        "printing_id": "48edaa8d-8750-4aeb-a246-73ce4ef1218f",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "armaldo delta species",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "2be123fd-f8a1-4e06-9940-d07de88b5cb1",
      "payload": {
        "id": "2be123fd-f8a1-4e06-9940-d07de88b5cb1",
        "name": "サボテン（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T21:27:03.985+00:00",
        "updated_at": "2026-08-06T21:27:03.985+00:00",
        "variant_id": "71c383ba-8c07-4106-8286-b8789db9414e",
        "printing_id": "16b33fb8-f25f-46d0-9cdc-3d58c9973093",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "サボテン(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "2dda29d5-6f37-46be-8f5a-81c6493ccb49",
      "payload": {
        "id": "2dda29d5-6f37-46be-8f5a-81c6493ccb49",
        "name": "Cacturne Delta Species",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:27:04.77+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "71c383ba-8c07-4106-8286-b8789db9414e",
        "printing_id": "16b33fb8-f25f-46d0-9cdc-3d58c9973093",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "cacturne delta species",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "30879cca-e6b7-4eeb-a05c-b09a3a5e99f2",
      "payload": {
        "id": "30879cca-e6b7-4eeb-a05c-b09a3a5e99f2",
        "name": "Rare Candy",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:26:15.393+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "1b73d0d4-dba6-4acf-a068-f1334471af86",
        "printing_id": "38e67ba5-019b-405a-9800-6995a3d62393",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "rare candy",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "400df314-53e8-48d6-ab4f-52ad09bb243e",
      "payload": {
        "id": "400df314-53e8-48d6-ab4f-52ad09bb243e",
        "name": "槍",
        "name_type": "native",
        "created_at": "2026-08-06T21:27:04.549+00:00",
        "updated_at": "2026-08-06T21:27:04.549+00:00",
        "variant_id": "4a2f5781-18e8-47f3-8306-2bc8e0112d48",
        "printing_id": "4f98bea0-d418-4443-84bf-07a30281a5d3",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "槍",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "457aeea5-3ccd-4a2d-9357-575f16ea73a9",
      "payload": {
        "id": "457aeea5-3ccd-4a2d-9357-575f16ea73a9",
        "name": "Cradily Delta Species",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:26:07.66+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "0bc646ec-08da-4061-b201-ccfdf7e4014b",
        "printing_id": "d9d4cb1b-0b22-4753-98f2-181298f22a07",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "cradily delta species",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "48676fc3-469f-4020-b4f8-4c47992c4cc6",
      "payload": {
        "id": "48676fc3-469f-4020-b4f8-4c47992c4cc6",
        "name": "キャスト・アウェイ",
        "name_type": "native",
        "created_at": "2026-08-06T21:27:16.718+00:00",
        "updated_at": "2026-08-06T21:27:16.718+00:00",
        "variant_id": "3ec629ff-2cdc-4ee9-af18-84416f3a5bda",
        "printing_id": "e878f64d-e38a-4d38-854b-d0dedb8ecafe",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "キャスト・アウェイ",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "57637bbe-7975-4fea-b327-182a3a61b965",
      "payload": {
        "id": "57637bbe-7975-4fea-b327-182a3a61b965",
        "name": "deoxys（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T12:55:18.671+00:00",
        "updated_at": "2026-08-06T12:55:18.671+00:00",
        "variant_id": "20f763a7-10b5-440b-aea6-88ea38d92e2d",
        "printing_id": "44e54db1-ee82-40e2-9465-c5eb1cc18cdb",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "deoxys(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "587f416d-600a-43eb-a488-e09f22333d98",
      "payload": {
        "id": "587f416d-600a-43eb-a488-e09f22333d98",
        "name": "Spearow",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:27:05.23+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "4a2f5781-18e8-47f3-8306-2bc8e0112d48",
        "printing_id": "4f98bea0-d418-4443-84bf-07a30281a5d3",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "spearow",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "69795e89-989d-4056-8c69-fa80180a220c",
      "payload": {
        "id": "69795e89-989d-4056-8c69-fa80180a220c",
        "name": "Double Rainbow Energy",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:27:20.226+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "f0ddf359-2d96-4bef-b096-1ab9df898aff",
        "printing_id": "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "double rainbow energy",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "6fd32113-8e10-4232-bd9d-b222d5927f53",
      "payload": {
        "id": "6fd32113-8e10-4232-bd9d-b222d5927f53",
        "name": "Castaway",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:27:17.26+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "3ec629ff-2cdc-4ee9-af18-84416f3a5bda",
        "printing_id": "e878f64d-e38a-4d38-854b-d0dedb8ecafe",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "castaway",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "6ff4300c-18c1-4381-b8cd-25e9a517443e",
      "payload": {
        "id": "6ff4300c-18c1-4381-b8cd-25e9a517443e",
        "name": "ゆっくり（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T21:26:06.295+00:00",
        "updated_at": "2026-08-06T21:26:06.295+00:00",
        "variant_id": "0bc646ec-08da-4061-b201-ccfdf7e4014b",
        "printing_id": "d9d4cb1b-0b22-4753-98f2-181298f22a07",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ゆっくり(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "9092e09f-ca57-4fd7-a2fe-0b5ba2283c8b",
      "payload": {
        "id": "9092e09f-ca57-4fd7-a2fe-0b5ba2283c8b",
        "name": "珍しいキャンディー",
        "name_type": "native",
        "created_at": "2026-08-06T21:26:14.712+00:00",
        "updated_at": "2026-08-06T21:26:14.712+00:00",
        "variant_id": "1b73d0d4-dba6-4acf-a068-f1334471af86",
        "printing_id": "38e67ba5-019b-405a-9800-6995a3d62393",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "珍しいキャンディー",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "a24760c1-7a36-4cb9-ba6b-a63578c0049b",
      "payload": {
        "id": "a24760c1-7a36-4cb9-ba6b-a63578c0049b",
        "name": "ホロンアドベンチャー",
        "name_type": "native",
        "created_at": "2026-08-06T21:26:16.573+00:00",
        "updated_at": "2026-08-06T21:26:16.573+00:00",
        "variant_id": "a18ce7b9-4b4b-4e25-8d12-800d49b19c0e",
        "printing_id": "826abe37-5568-4559-b3e2-da9cc4e29658",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ホロンアドベンチャー",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "a6344af7-6426-470e-9535-7bec68e6a8e8",
      "payload": {
        "id": "a6344af7-6426-470e-9535-7bec68e6a8e8",
        "name": "アルマルド（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T21:26:02.951+00:00",
        "updated_at": "2026-08-06T21:26:02.951+00:00",
        "variant_id": "c33e36aa-e537-49b8-b508-63064b097899",
        "printing_id": "48edaa8d-8750-4aeb-a246-73ce4ef1218f",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "アルマルド(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "bc212943-6c50-422b-9a14-8fd5f67327ef",
      "payload": {
        "id": "bc212943-6c50-422b-9a14-8fd5f67327ef",
        "name": "Holon Adventurer",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:26:17.381+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "variant_id": "a18ce7b9-4b4b-4e25-8d12-800d49b19c0e",
        "printing_id": "826abe37-5568-4559-b3e2-da9cc4e29658",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "holon adventurer",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "c2c8b95e-5fe3-4b68-a864-e14b5d990d0b",
      "payload": {
        "id": "c2c8b95e-5fe3-4b68-a864-e14b5d990d0b",
        "name": "jigglypuff",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:27:07.918+00:00",
        "updated_at": "2026-08-06T21:27:07.918+00:00",
        "variant_id": "c73b2587-431d-47e1-ac6f-654d5559532f",
        "printing_id": "65ce4679-d7b1-48b4-a747-2e18cf57847f",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "jigglypuff",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "ce30f446-df5e-435d-84ca-1374e3d1f37b",
      "payload": {
        "id": "ce30f446-df5e-435d-84ca-1374e3d1f37b",
        "name": "二重虹のエネルギー",
        "name_type": "native",
        "created_at": "2026-08-06T21:27:19.753+00:00",
        "updated_at": "2026-08-06T21:27:19.753+00:00",
        "variant_id": "f0ddf359-2d96-4bef-b096-1ab9df898aff",
        "printing_id": "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "二重虹のエネルギー",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "d32db986-3278-48c1-9005-079a66faf558",
      "payload": {
        "id": "d32db986-3278-48c1-9005-079a66faf558",
        "name": "deoxys δ",
        "name_type": "english_display",
        "created_at": "2026-08-06T12:55:20.681+00:00",
        "updated_at": "2026-10-06T18:45:21.774872+00:00",
        "variant_id": "20f763a7-10b5-440b-aea6-88ea38d92e2d",
        "printing_id": "44e54db1-ee82-40e2-9465-c5eb1cc18cdb",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "deoxys δ",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "printings",
      "identity": "16b33fb8-f25f-46d0-9cdc-3d58c9973093",
      "payload": {
        "id": "16b33fb8-f25f-46d0-9cdc-3d58c9973093",
        "artist": null,
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "b92f9cd1-5e40-4b96-b021-49425d5f3b74",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:27:02.695+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "サボテン（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "f387227e-ae37-487d-9683-75941c656c34",
        "discontinued_at": null,
        "collector_number": "048",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Cacturne Delta Species",
        "collector_number_sort": 48,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000048"
      }
    },
    {
      "scope": "printings",
      "identity": "38e67ba5-019b-405a-9800-6995a3d62393",
      "payload": {
        "id": "38e67ba5-019b-405a-9800-6995a3d62393",
        "artist": null,
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:26:13.038+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "珍しいキャンディー",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "cec71936-e8f7-4888-b8d7-779face465d6",
        "discontinued_at": null,
        "collector_number": "048",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Rare Candy",
        "collector_number_sort": 48,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000048"
      }
    },
    {
      "scope": "printings",
      "identity": "40c40f95-7df1-4153-9030-1871ccaf77cf",
      "payload": {
        "id": "40c40f95-7df1-4153-9030-1871ccaf77cf",
        "artist": null,
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "b92f9cd1-5e40-4b96-b021-49425d5f3b74",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:27:01.62+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "メディチャム",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "02382915-9662-48a8-9727-76f17e8db8c9",
        "discontinued_at": null,
        "collector_number": "047",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Medicham",
        "collector_number_sort": 47,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000047"
      }
    },
    {
      "scope": "printings",
      "identity": "44e54db1-ee82-40e2-9465-c5eb1cc18cdb",
      "payload": {
        "id": "44e54db1-ee82-40e2-9465-c5eb1cc18cdb",
        "artist": null,
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "b92f9cd1-5e40-4b96-b021-49425d5f3b74",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T12:55:15.28+00:00",
        "updated_at": "2026-10-06T18:45:21.774872+00:00",
        "native_name": "deoxys（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "d251592e-74d1-45e0-90e9-e36662b23346",
        "discontinued_at": null,
        "collector_number": "022",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "deoxys δ",
        "collector_number_sort": 22,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000022"
      }
    },
    {
      "scope": "printings",
      "identity": "48edaa8d-8750-4aeb-a246-73ce4ef1218f",
      "payload": {
        "id": "48edaa8d-8750-4aeb-a246-73ce4ef1218f",
        "artist": null,
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "b92f9cd1-5e40-4b96-b021-49425d5f3b74",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:26:01.276+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "アルマルド（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "0a6ea202-6060-4e0f-b968-9456fe9638d7",
        "discontinued_at": null,
        "collector_number": "033",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Armaldo Delta Species",
        "collector_number_sort": 33,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000033"
      }
    },
    {
      "scope": "printings",
      "identity": "4f98bea0-d418-4443-84bf-07a30281a5d3",
      "payload": {
        "id": "4f98bea0-d418-4443-84bf-07a30281a5d3",
        "artist": null,
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "d3aeeb9c-841e-4088-8fa8-bc4028b800de",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:27:03.576+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "槍",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "c25bf955-2ee9-480d-a265-6d591228ce65",
        "discontinued_at": null,
        "collector_number": "050",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Spearow",
        "collector_number_sort": 50,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000050"
      }
    },
    {
      "scope": "printings",
      "identity": "65ce4679-d7b1-48b4-a747-2e18cf57847f",
      "payload": {
        "id": "65ce4679-d7b1-48b4-a747-2e18cf57847f",
        "artist": null,
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "d3aeeb9c-841e-4088-8fa8-bc4028b800de",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:27:05.861+00:00",
        "updated_at": "2026-08-20T12:15:49.787+00:00",
        "native_name": "jigglypuff",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "5c688f3f-678e-4e8e-84d3-c5ddaf5db6d4",
        "discontinued_at": null,
        "collector_number": "051",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "jigglypuff",
        "collector_number_sort": 51,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000051"
      }
    },
    {
      "scope": "printings",
      "identity": "73c8c54f-ca86-411d-bc34-437d6bbae88a",
      "payload": {
        "id": "73c8c54f-ca86-411d-bc34-437d6bbae88a",
        "artist": null,
        "set_id": "b5ef438a-ddcb-4093-8c9b-572639565af5",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "b92f9cd1-5e40-4b96-b021-49425d5f3b74",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:28:00.351+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "デューゴン（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "45cd71b2-2828-448f-9297-e72a5acfb660",
        "discontinued_at": null,
        "collector_number": "048",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Dewgong Delta Species",
        "collector_number_sort": 48,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000048"
      }
    },
    {
      "scope": "printings",
      "identity": "826abe37-5568-4559-b3e2-da9cc4e29658",
      "payload": {
        "id": "826abe37-5568-4559-b3e2-da9cc4e29658",
        "artist": null,
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:26:14.91+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "ホロンアドベンチャー",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "516bfc5e-f527-4a47-9160-f54197e7a8f8",
        "discontinued_at": null,
        "collector_number": "050",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Holon Adventurer",
        "collector_number_sort": 50,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000050"
      }
    },
    {
      "scope": "printings",
      "identity": "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5",
      "payload": {
        "id": "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5",
        "artist": null,
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:27:18.731+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "二重虹のエネルギー",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "a163a876-11d7-41c8-bb77-5dc74195b28e",
        "discontinued_at": null,
        "collector_number": "075",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Double Rainbow Energy",
        "collector_number_sort": 75,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000075"
      }
    },
    {
      "scope": "printings",
      "identity": "d9d4cb1b-0b22-4753-98f2-181298f22a07",
      "payload": {
        "id": "d9d4cb1b-0b22-4753-98f2-181298f22a07",
        "artist": null,
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "b92f9cd1-5e40-4b96-b021-49425d5f3b74",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:26:04.789+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "ゆっくり（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "61990617-6f6d-41d1-acc7-cb829b3cb93e",
        "discontinued_at": null,
        "collector_number": "040",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Cradily Delta Species",
        "collector_number_sort": 40,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000040"
      }
    },
    {
      "scope": "printings",
      "identity": "e878f64d-e38a-4d38-854b-d0dedb8ecafe",
      "payload": {
        "id": "e878f64d-e38a-4d38-854b-d0dedb8ecafe",
        "artist": null,
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:27:15.954+00:00",
        "updated_at": "2026-10-06T19:59:27.893636+00:00",
        "native_name": "キャスト・アウェイ",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "faca7430-8e9f-4968-96a2-cb92cbdfba35",
        "discontinued_at": null,
        "collector_number": "068",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": "Castaway",
        "collector_number_sort": 68,
        "printing_discriminator": "",
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000068"
      }
    },
    {
      "scope": "sets",
      "identity": "421a8323-4094-4c7f-8622-fb6af390becc",
      "payload": {
        "id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "total": 52,
        "set_code": "PCG7",
        "game_code": "pokemon",
        "series_id": null,
        "created_at": "2026-08-05T13:48:54.544+00:00",
        "updated_at": "2026-09-27T06:36:24.294582+00:00",
        "native_name": "ホロンの幻影",
        "region_code": null,
        "release_date": "2006-01-27",
        "deprecated_at": null,
        "display_order": null,
        "language_code": "ja",
        "printed_total": 52,
        "discontinued_at": null,
        "deprecated_reason": null,
        "provider_set_code": "PCG7",
        "source_updated_at": null,
        "corrected_by_set_id": null,
        "english_display_name": "Holon Phantom"
      }
    },
    {
      "scope": "sets",
      "identity": "b5ef438a-ddcb-4093-8c9b-572639565af5",
      "payload": {
        "id": "b5ef438a-ddcb-4093-8c9b-572639565af5",
        "total": 68,
        "set_code": "PCG9",
        "game_code": "pokemon",
        "series_id": null,
        "created_at": "2026-08-05T13:48:55.595+00:00",
        "updated_at": "2026-09-27T06:36:24.294582+00:00",
        "native_name": "さいはての攻防",
        "region_code": null,
        "release_date": "2006-06-29",
        "deprecated_at": null,
        "display_order": null,
        "language_code": "ja",
        "printed_total": 68,
        "discontinued_at": null,
        "deprecated_reason": null,
        "provider_set_code": "PCG9",
        "source_updated_at": null,
        "corrected_by_set_id": null,
        "english_display_name": "Offense and Defense of the Furthest Ends"
      }
    },
    {
      "scope": "sets",
      "identity": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
      "payload": {
        "id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "total": 75,
        "set_code": "PCG8",
        "game_code": "pokemon",
        "series_id": null,
        "created_at": "2026-08-05T13:48:55.077+00:00",
        "updated_at": "2026-09-27T06:36:24.294582+00:00",
        "native_name": "きせきの結晶",
        "region_code": null,
        "release_date": "2006-03-10",
        "deprecated_at": null,
        "display_order": null,
        "language_code": "ja",
        "printed_total": 75,
        "discontinued_at": null,
        "deprecated_reason": null,
        "provider_set_code": "PCG8",
        "source_updated_at": null,
        "corrected_by_set_id": null,
        "english_display_name": "Miracle Crystal"
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
      "identity": "052ae4a3-808a-4626-90b1-a8947c6eee70",
      "payload": {
        "id": "052ae4a3-808a-4626-90b1-a8947c6eee70",
        "set_id": "b5ef438a-ddcb-4093-8c9b-572639565af5",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:28:00.888+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "73c8c54f-ca86-411d-bc34-437d6bbae88a",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:b5ef438a-ddcb-4093-8c9b-572639565af5:048:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "048",
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
      "identity": "0bc646ec-08da-4061-b201-ccfdf7e4014b",
      "payload": {
        "id": "0bc646ec-08da-4061-b201-ccfdf7e4014b",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:26:05.253+00:00",
        "is_default": false,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "d9d4cb1b-0b22-4753-98f2-181298f22a07",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:421a8323-4094-4c7f-8622-fb6af390becc:040:holo",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "040",
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
      "identity": "1b73d0d4-dba6-4acf-a068-f1334471af86",
      "payload": {
        "id": "1b73d0d4-dba6-4acf-a068-f1334471af86",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:26:13.557+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "38e67ba5-019b-405a-9800-6995a3d62393",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:421a8323-4094-4c7f-8622-fb6af390becc:048:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "048",
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
      "identity": "20f763a7-10b5-440b-aea6-88ea38d92e2d",
      "payload": {
        "id": "20f763a7-10b5-440b-aea6-88ea38d92e2d",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "game_code": "pokemon",
        "created_at": "2026-08-06T12:55:16.194+00:00",
        "is_default": false,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "44e54db1-ee82-40e2-9465-c5eb1cc18cdb",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:421a8323-4094-4c7f-8622-fb6af390becc:022:holo",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "022",
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
      "identity": "3ec629ff-2cdc-4ee9-af18-84416f3a5bda",
      "payload": {
        "id": "3ec629ff-2cdc-4ee9-af18-84416f3a5bda",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:27:16.148+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "e878f64d-e38a-4d38-854b-d0dedb8ecafe",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:d832f428-8d51-4ac0-a3cf-a5d38bddb88d:068:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "068",
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
      "identity": "4a2f5781-18e8-47f3-8306-2bc8e0112d48",
      "payload": {
        "id": "4a2f5781-18e8-47f3-8306-2bc8e0112d48",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:27:04.003+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "4f98bea0-d418-4443-84bf-07a30281a5d3",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:d832f428-8d51-4ac0-a3cf-a5d38bddb88d:050:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "050",
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
      "identity": "71c383ba-8c07-4106-8286-b8789db9414e",
      "payload": {
        "id": "71c383ba-8c07-4106-8286-b8789db9414e",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:27:03.069+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "16b33fb8-f25f-46d0-9cdc-3d58c9973093",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:d832f428-8d51-4ac0-a3cf-a5d38bddb88d:048:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "048",
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
      "identity": "a18ce7b9-4b4b-4e25-8d12-800d49b19c0e",
      "payload": {
        "id": "a18ce7b9-4b4b-4e25-8d12-800d49b19c0e",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:26:15.585+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "826abe37-5568-4559-b3e2-da9cc4e29658",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:421a8323-4094-4c7f-8622-fb6af390becc:050:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "050",
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
      "identity": "c33e36aa-e537-49b8-b508-63064b097899",
      "payload": {
        "id": "c33e36aa-e537-49b8-b508-63064b097899",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:26:02.194+00:00",
        "is_default": false,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "48edaa8d-8750-4aeb-a246-73ce4ef1218f",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:421a8323-4094-4c7f-8622-fb6af390becc:033:holo",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "033",
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
      "identity": "c73b2587-431d-47e1-ac6f-654d5559532f",
      "payload": {
        "id": "c73b2587-431d-47e1-ac6f-654d5559532f",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:27:06.19+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "65ce4679-d7b1-48b4-a747-2e18cf57847f",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:d832f428-8d51-4ac0-a3cf-a5d38bddb88d:051:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "051",
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
      "identity": "eb6c6e73-dc4c-4a20-a83a-57071ad93969",
      "payload": {
        "id": "eb6c6e73-dc4c-4a20-a83a-57071ad93969",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:27:01.965+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "40c40f95-7df1-4153-9030-1871ccaf77cf",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:d832f428-8d51-4ac0-a3cf-a5d38bddb88d:047:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "047",
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
      "identity": "f0ddf359-2d96-4bef-b096-1ab9df898aff",
      "payload": {
        "id": "f0ddf359-2d96-4bef-b096-1ab9df898aff",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:27:19+00:00",
        "is_default": true,
        "updated_at": "2026-08-20T13:52:20.118+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:d832f428-8d51-4ac0-a3cf-a5d38bddb88d:075:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "075",
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
      "scope": "assets",
      "identity": "a4f77ec6-3494-4d29-94ef-2e53734e3c46",
      "payload": {
        "id": "a4f77ec6-3494-4d29-94ef-2e53734e3c46",
        "url": "https://lmwfhvexfcoyeuoyrlco.supabase.co/storage/v1/object/public/stackr-catalogue-public/public/set_logo/reviewed/catalogue/421a8323-4094-4c7f-8622-fb6af390becc/ef262543fe1bdf6b88d7a1fbfd31da49f6991bf6d236e6ea0cd54e79836f6d64/delivery.png",
        "width": 2047,
        "height": 480,
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "sha256": "ef262543fe1bdf6b88d7a1fbfd31da49f6991bf6d236e6ea0cd54e79836f6d64",
        "asset_id": "reviewed:set-logo:421a8323-4094-4c7f-8622-fb6af390becc:ef262543fe1bdf6b88d7a1fbfd31da49f6991bf6d236e6ea0cd54e79836f6d64",
        "byte_size": 1700662,
        "game_code": "pokemon",
        "mime_type": "image/png",
        "source_id": "5f294603-9e75-4c94-bad1-641f24dc65a3",
        "asset_type": "set_logo",
        "created_at": "2026-10-10T09:08:25.690526+00:00",
        "deleted_at": null,
        "updated_at": "2026-10-10T09:08:25.690526+00:00",
        "variant_id": null,
        "printing_id": null,
        "storage_key": "public/set_logo/reviewed/catalogue/421a8323-4094-4c7f-8622-fb6af390becc/ef262543fe1bdf6b88d7a1fbfd31da49f6991bf6d236e6ea0cd54e79836f6d64/delivery.png",
        "storage_path": "public/set_logo/reviewed/catalogue/421a8323-4094-4c7f-8622-fb6af390becc/ef262543fe1bdf6b88d7a1fbfd31da49f6991bf6d236e6ea0cd54e79836f6d64/delivery.png",
        "cache_control": "public, max-age=31536000, immutable",
        "deprecated_at": null,
        "rights_status": "approved",
        "content_sha256": "ef262543fe1bdf6b88d7a1fbfd31da49f6991bf6d236e6ea0cd54e79836f6d64",
        "storage_bucket": "stackr-catalogue-public",
        "deletion_reason": null,
        "derivative_list": [],
        "perceptual_hash": null,
        "retention_until": null,
        "asset_visibility": "public_catalogue",
        "attribution_text": null,
        "last_verified_at": "2026-10-10T09:08:25.690526+00:00",
        "retention_status": "active",
        "storage_provider": "supabase_storage",
        "deprecated_reason": null,
        "permission_status": "approved",
        "publicly_servable": true,
        "source_updated_at": null,
        "acquisition_source": "existing_stackr_catalogue_asset",
        "source_attribution": "User-approved Stackr set presentation; source_logo; AI-assisted background isolation of the printed bottom package wordmark using built-in image_gen; transparent output; Japanese title, ruby and subtitle visually checked against the preserved photograph. Output dimensions are derivative dimensions, not a native HD original claim.",
        "unavailable_reason": null,
        "original_source_url": null,
        "archival_storage_key": null,
        "externally_referenced": false,
        "licensing_review_notes": "{\"fallback\": false, \"aiAssisted\": true, \"approvedAt\": \"2026-10-10\", \"processing\": \"AI-assisted background isolation of the printed bottom package wordmark using built-in image_gen; transparent output; Japanese title, ruby and subtitle visually checked against the preserved photograph. Output dimensions are derivative dimensions, not a native HD original claim.\", \"displayCrop\": {\"cropBounds\": [82, 158, 2129, 638], \"sourceWidth\": 2146, \"sourceHeight\": 733, \"excludeBounds\": []}, \"matchMethod\": \"recorded_canonical_id\", \"sourceWidth\": 2146, \"sourceHeight\": 733, \"sourceSha256\": \"32b389d2c67df72fc0b196ad92b32d18036f4e8344dcccb2b6baf57cfed98a30\", \"representation\": \"source_logo\", \"stagingApproval\": {\"basis\": \"existing_exact_production_approval\", \"setId\": \"421a8323-4094-4c7f-8622-fb6af390becc\", \"language\": \"ja\", \"rightsStatus\": \"approved\", \"permissionStatus\": \"approved\", \"sourceAssetRowId\": \"cad2551b-762b-435a-96fc-83426d0f4acb\", \"sourceProjectRef\": \"oakdbbzdqwurpjnoqhmu\", \"sourceStorageKey\": \"public/set_logo/reviewed/catalogue/421a8323-4094-4c7f-8622-fb6af390becc/ef262543fe1bdf6b88d7a1fbfd31da49f6991bf6d236e6ea0cd54e79836f6d64/delivery.png\", \"approvedInputSha256\": \"32b389d2c67df72fc0b196ad92b32d18036f4e8344dcccb2b6baf57cfed98a30\", \"sourceContentSha256\": \"ef262543fe1bdf6b88d7a1fbfd31da49f6991bf6d236e6ea0cd54e79836f6d64\", \"sourceAssetIdentifier\": \"reviewed:set-logo:421a8323-4094-4c7f-8622-fb6af390becc:ef262543fe1bdf6b88d7a1fbfd31da49f6991bf6d236e6ea0cd54e79836f6d64\", \"sourceApprovalCapturedAt\": \"2026-10-10T07:56:16.53027+00:00\"}, \"inputSourceSha256\": \"32b389d2c67df72fc0b196ad92b32d18036f4e8344dcccb2b6baf57cfed98a30\"}",
        "original_source_identifier": "stackr-reviewed-set-logo:ff552fa346e8fba9001fe1bd5b838e2a9f5bf3faf44723985cc4365446008bd5",
        "recognition_reference_eligible": false
      }
    },
    {
      "scope": "links",
      "identity": "d560cd01-de2a-4713-9518-b967fb4c5ac9:a4f77ec6-3494-4d29-94ef-2e53734e3c46",
      "payload": {
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "asset_id": "a4f77ec6-3494-4d29-94ef-2e53734e3c46",
        "asset_type": "set_logo",
        "created_at": "2026-10-10T09:08:25.690526+00:00",
        "variant_id": null,
        "printing_id": null,
        "language_code": "ja",
        "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9"
      }
    },
    {
      "scope": "names",
      "identity": "02c0af04-b13d-4ab3-a713-352a193d10c1",
      "payload": {
        "id": "02c0af04-b13d-4ab3-a713-352a193d10c1",
        "name": "デューゴン（デルタ種）",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:28:03.095324+00:00",
        "updated_at": "2026-08-06T21:28:03.095324+00:00",
        "variant_id": "052ae4a3-808a-4626-90b1-a8947c6eee70",
        "printing_id": "73c8c54f-ca86-411d-bc34-437d6bbae88a",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "デューゴン(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "0759badf-1a1a-4b49-88e1-093ded6f0e77",
      "payload": {
        "id": "0759badf-1a1a-4b49-88e1-093ded6f0e77",
        "name": "デューゴン（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T21:28:01.968929+00:00",
        "updated_at": "2026-08-06T21:28:01.968929+00:00",
        "variant_id": "052ae4a3-808a-4626-90b1-a8947c6eee70",
        "printing_id": "73c8c54f-ca86-411d-bc34-437d6bbae88a",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "デューゴン(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "0b181918-c6d7-4b6c-9512-a673b83c07b1",
      "payload": {
        "id": "0b181918-c6d7-4b6c-9512-a673b83c07b1",
        "name": "メディチャム",
        "name_type": "native",
        "created_at": "2026-08-06T21:27:02.726212+00:00",
        "updated_at": "2026-08-06T21:27:02.726212+00:00",
        "variant_id": "eb6c6e73-dc4c-4a20-a83a-57071ad93969",
        "printing_id": "40c40f95-7df1-4153-9030-1871ccaf77cf",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "メディチャム",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "1828ac25-af51-4854-9115-5f8a2d0811cb",
      "payload": {
        "id": "1828ac25-af51-4854-9115-5f8a2d0811cb",
        "name": "メディチャム",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:27:03.353646+00:00",
        "updated_at": "2026-08-06T21:27:03.353646+00:00",
        "variant_id": "eb6c6e73-dc4c-4a20-a83a-57071ad93969",
        "printing_id": "40c40f95-7df1-4153-9030-1871ccaf77cf",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "メディチャム",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "1c5263c3-867f-476f-9405-2b90c4959151",
      "payload": {
        "id": "1c5263c3-867f-476f-9405-2b90c4959151",
        "name": "jigglypuff",
        "name_type": "native",
        "created_at": "2026-08-06T21:27:06.957136+00:00",
        "updated_at": "2026-08-06T21:27:06.957136+00:00",
        "variant_id": "c73b2587-431d-47e1-ac6f-654d5559532f",
        "printing_id": "65ce4679-d7b1-48b4-a747-2e18cf57847f",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "jigglypuff",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "29fedf47-adce-4c6e-995c-0acc8bf2403d",
      "payload": {
        "id": "29fedf47-adce-4c6e-995c-0acc8bf2403d",
        "name": "アルマルド（デルタ種）",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:26:04.047239+00:00",
        "updated_at": "2026-08-06T21:26:04.047239+00:00",
        "variant_id": "c33e36aa-e537-49b8-b508-63064b097899",
        "printing_id": "48edaa8d-8750-4aeb-a246-73ce4ef1218f",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "アルマルド(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "2be123fd-f8a1-4e06-9940-d07de88b5cb1",
      "payload": {
        "id": "2be123fd-f8a1-4e06-9940-d07de88b5cb1",
        "name": "サボテン（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T21:27:03.985185+00:00",
        "updated_at": "2026-08-06T21:27:03.985185+00:00",
        "variant_id": "71c383ba-8c07-4106-8286-b8789db9414e",
        "printing_id": "16b33fb8-f25f-46d0-9cdc-3d58c9973093",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "サボテン(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "2dda29d5-6f37-46be-8f5a-81c6493ccb49",
      "payload": {
        "id": "2dda29d5-6f37-46be-8f5a-81c6493ccb49",
        "name": "サボテン（デルタ種）",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:27:04.770342+00:00",
        "updated_at": "2026-08-06T21:27:04.770342+00:00",
        "variant_id": "71c383ba-8c07-4106-8286-b8789db9414e",
        "printing_id": "16b33fb8-f25f-46d0-9cdc-3d58c9973093",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "サボテン(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "30879cca-e6b7-4eeb-a05c-b09a3a5e99f2",
      "payload": {
        "id": "30879cca-e6b7-4eeb-a05c-b09a3a5e99f2",
        "name": "珍しいキャンディー",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:26:15.393648+00:00",
        "updated_at": "2026-08-06T21:26:15.393648+00:00",
        "variant_id": "1b73d0d4-dba6-4acf-a068-f1334471af86",
        "printing_id": "38e67ba5-019b-405a-9800-6995a3d62393",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "珍しいキャンディー",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "400df314-53e8-48d6-ab4f-52ad09bb243e",
      "payload": {
        "id": "400df314-53e8-48d6-ab4f-52ad09bb243e",
        "name": "槍",
        "name_type": "native",
        "created_at": "2026-08-06T21:27:04.549225+00:00",
        "updated_at": "2026-08-06T21:27:04.549225+00:00",
        "variant_id": "4a2f5781-18e8-47f3-8306-2bc8e0112d48",
        "printing_id": "4f98bea0-d418-4443-84bf-07a30281a5d3",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "槍",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "457aeea5-3ccd-4a2d-9357-575f16ea73a9",
      "payload": {
        "id": "457aeea5-3ccd-4a2d-9357-575f16ea73a9",
        "name": "ゆっくり（デルタ種）",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:26:07.660397+00:00",
        "updated_at": "2026-08-06T21:26:07.660397+00:00",
        "variant_id": "0bc646ec-08da-4061-b201-ccfdf7e4014b",
        "printing_id": "d9d4cb1b-0b22-4753-98f2-181298f22a07",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "ゆっくり(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "48676fc3-469f-4020-b4f8-4c47992c4cc6",
      "payload": {
        "id": "48676fc3-469f-4020-b4f8-4c47992c4cc6",
        "name": "キャスト・アウェイ",
        "name_type": "native",
        "created_at": "2026-08-06T21:27:16.718857+00:00",
        "updated_at": "2026-08-06T21:27:16.718857+00:00",
        "variant_id": "3ec629ff-2cdc-4ee9-af18-84416f3a5bda",
        "printing_id": "e878f64d-e38a-4d38-854b-d0dedb8ecafe",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "キャスト・アウェイ",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "57637bbe-7975-4fea-b327-182a3a61b965",
      "payload": {
        "id": "57637bbe-7975-4fea-b327-182a3a61b965",
        "name": "deoxys（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T12:55:18.67114+00:00",
        "updated_at": "2026-08-06T12:55:18.67114+00:00",
        "variant_id": "20f763a7-10b5-440b-aea6-88ea38d92e2d",
        "printing_id": "44e54db1-ee82-40e2-9465-c5eb1cc18cdb",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "deoxys(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "587f416d-600a-43eb-a488-e09f22333d98",
      "payload": {
        "id": "587f416d-600a-43eb-a488-e09f22333d98",
        "name": "槍",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:27:05.230325+00:00",
        "updated_at": "2026-08-06T21:27:05.230325+00:00",
        "variant_id": "4a2f5781-18e8-47f3-8306-2bc8e0112d48",
        "printing_id": "4f98bea0-d418-4443-84bf-07a30281a5d3",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "槍",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "69795e89-989d-4056-8c69-fa80180a220c",
      "payload": {
        "id": "69795e89-989d-4056-8c69-fa80180a220c",
        "name": "二重虹のエネルギー",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:27:20.226933+00:00",
        "updated_at": "2026-08-06T21:27:20.226933+00:00",
        "variant_id": "f0ddf359-2d96-4bef-b096-1ab9df898aff",
        "printing_id": "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "二重虹のエネルギー",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "6fd32113-8e10-4232-bd9d-b222d5927f53",
      "payload": {
        "id": "6fd32113-8e10-4232-bd9d-b222d5927f53",
        "name": "キャスト・アウェイ",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:27:17.260162+00:00",
        "updated_at": "2026-08-06T21:27:17.260162+00:00",
        "variant_id": "3ec629ff-2cdc-4ee9-af18-84416f3a5bda",
        "printing_id": "e878f64d-e38a-4d38-854b-d0dedb8ecafe",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "キャスト・アウェイ",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "6ff4300c-18c1-4381-b8cd-25e9a517443e",
      "payload": {
        "id": "6ff4300c-18c1-4381-b8cd-25e9a517443e",
        "name": "ゆっくり（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T21:26:06.295611+00:00",
        "updated_at": "2026-08-06T21:26:06.295611+00:00",
        "variant_id": "0bc646ec-08da-4061-b201-ccfdf7e4014b",
        "printing_id": "d9d4cb1b-0b22-4753-98f2-181298f22a07",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ゆっくり(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "9092e09f-ca57-4fd7-a2fe-0b5ba2283c8b",
      "payload": {
        "id": "9092e09f-ca57-4fd7-a2fe-0b5ba2283c8b",
        "name": "珍しいキャンディー",
        "name_type": "native",
        "created_at": "2026-08-06T21:26:14.712184+00:00",
        "updated_at": "2026-08-06T21:26:14.712184+00:00",
        "variant_id": "1b73d0d4-dba6-4acf-a068-f1334471af86",
        "printing_id": "38e67ba5-019b-405a-9800-6995a3d62393",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "珍しいキャンディー",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "a24760c1-7a36-4cb9-ba6b-a63578c0049b",
      "payload": {
        "id": "a24760c1-7a36-4cb9-ba6b-a63578c0049b",
        "name": "ホロンアドベンチャー",
        "name_type": "native",
        "created_at": "2026-08-06T21:26:16.573685+00:00",
        "updated_at": "2026-08-06T21:26:16.573685+00:00",
        "variant_id": "a18ce7b9-4b4b-4e25-8d12-800d49b19c0e",
        "printing_id": "826abe37-5568-4559-b3e2-da9cc4e29658",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "ホロンアドベンチャー",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "a6344af7-6426-470e-9535-7bec68e6a8e8",
      "payload": {
        "id": "a6344af7-6426-470e-9535-7bec68e6a8e8",
        "name": "アルマルド（デルタ種）",
        "name_type": "native",
        "created_at": "2026-08-06T21:26:02.951729+00:00",
        "updated_at": "2026-08-06T21:26:02.951729+00:00",
        "variant_id": "c33e36aa-e537-49b8-b508-63064b097899",
        "printing_id": "48edaa8d-8750-4aeb-a246-73ce4ef1218f",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "アルマルド(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "bc212943-6c50-422b-9a14-8fd5f67327ef",
      "payload": {
        "id": "bc212943-6c50-422b-9a14-8fd5f67327ef",
        "name": "ホロンアドベンチャー",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:26:17.381615+00:00",
        "updated_at": "2026-08-06T21:26:17.381615+00:00",
        "variant_id": "a18ce7b9-4b4b-4e25-8d12-800d49b19c0e",
        "printing_id": "826abe37-5568-4559-b3e2-da9cc4e29658",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "ホロンアドベンチャー",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "c2c8b95e-5fe3-4b68-a864-e14b5d990d0b",
      "payload": {
        "id": "c2c8b95e-5fe3-4b68-a864-e14b5d990d0b",
        "name": "jigglypuff",
        "name_type": "english_display",
        "created_at": "2026-08-06T21:27:07.918135+00:00",
        "updated_at": "2026-08-06T21:27:07.918135+00:00",
        "variant_id": "c73b2587-431d-47e1-ac6f-654d5559532f",
        "printing_id": "65ce4679-d7b1-48b4-a747-2e18cf57847f",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "jigglypuff",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "ce30f446-df5e-435d-84ca-1374e3d1f37b",
      "payload": {
        "id": "ce30f446-df5e-435d-84ca-1374e3d1f37b",
        "name": "二重虹のエネルギー",
        "name_type": "native",
        "created_at": "2026-08-06T21:27:19.753234+00:00",
        "updated_at": "2026-08-06T21:27:19.753234+00:00",
        "variant_id": "f0ddf359-2d96-4bef-b096-1ab9df898aff",
        "printing_id": "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": null,
        "normalized_name": "二重虹のエネルギー",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "names",
      "identity": "d32db986-3278-48c1-9005-079a66faf558",
      "payload": {
        "id": "d32db986-3278-48c1-9005-079a66faf558",
        "name": "deoxys（デルタ種）",
        "name_type": "english_display",
        "created_at": "2026-08-06T12:55:20.681187+00:00",
        "updated_at": "2026-08-06T12:55:20.681187+00:00",
        "variant_id": "20f763a7-10b5-440b-aea6-88ea38d92e2d",
        "printing_id": "44e54db1-ee82-40e2-9465-c5eb1cc18cdb",
        "deprecated_at": null,
        "language_code": "en",
        "card_concept_id": null,
        "normalized_name": "deoxys(デルタ種)",
        "deprecated_reason": null,
        "source_confidence": 0.85,
        "source_updated_at": null
      }
    },
    {
      "scope": "printings",
      "identity": "16b33fb8-f25f-46d0-9cdc-3d58c9973093",
      "payload": {
        "id": "16b33fb8-f25f-46d0-9cdc-3d58c9973093",
        "artist": null,
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "b92f9cd1-5e40-4b96-b021-49425d5f3b74",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:27:02.695113+00:00",
        "updated_at": "2026-08-31T04:33:48.39053+00:00",
        "native_name": "サボテン（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "f387227e-ae37-487d-9683-75941c656c34",
        "discontinued_at": null,
        "collector_number": "048",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 48,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000048"
      }
    },
    {
      "scope": "printings",
      "identity": "38e67ba5-019b-405a-9800-6995a3d62393",
      "payload": {
        "id": "38e67ba5-019b-405a-9800-6995a3d62393",
        "artist": null,
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:26:13.038181+00:00",
        "updated_at": "2026-08-31T04:33:32.261058+00:00",
        "native_name": "珍しいキャンディー",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "cec71936-e8f7-4888-b8d7-779face465d6",
        "discontinued_at": null,
        "collector_number": "048",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 48,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000048"
      }
    },
    {
      "scope": "printings",
      "identity": "40c40f95-7df1-4153-9030-1871ccaf77cf",
      "payload": {
        "id": "40c40f95-7df1-4153-9030-1871ccaf77cf",
        "artist": null,
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "b92f9cd1-5e40-4b96-b021-49425d5f3b74",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:27:01.620741+00:00",
        "updated_at": "2026-08-31T04:33:48.038694+00:00",
        "native_name": "メディチャム",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "02382915-9662-48a8-9727-76f17e8db8c9",
        "discontinued_at": null,
        "collector_number": "047",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 47,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000047"
      }
    },
    {
      "scope": "printings",
      "identity": "44e54db1-ee82-40e2-9465-c5eb1cc18cdb",
      "payload": {
        "id": "44e54db1-ee82-40e2-9465-c5eb1cc18cdb",
        "artist": null,
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "bed84eca-bf58-47d5-94db-3714d513b38f",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T12:55:15.280002+00:00",
        "updated_at": "2026-08-31T04:33:22.028605+00:00",
        "native_name": "deoxys（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "d251592e-74d1-45e0-90e9-e36662b23346",
        "discontinued_at": null,
        "collector_number": "022",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 22,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000022"
      }
    },
    {
      "scope": "printings",
      "identity": "48edaa8d-8750-4aeb-a246-73ce4ef1218f",
      "payload": {
        "id": "48edaa8d-8750-4aeb-a246-73ce4ef1218f",
        "artist": null,
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "bed84eca-bf58-47d5-94db-3714d513b38f",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:26:01.276668+00:00",
        "updated_at": "2026-08-31T04:33:27.054643+00:00",
        "native_name": "アルマルド（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "0a6ea202-6060-4e0f-b968-9456fe9638d7",
        "discontinued_at": null,
        "collector_number": "033",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 33,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000033"
      }
    },
    {
      "scope": "printings",
      "identity": "4f98bea0-d418-4443-84bf-07a30281a5d3",
      "payload": {
        "id": "4f98bea0-d418-4443-84bf-07a30281a5d3",
        "artist": null,
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "d3aeeb9c-841e-4088-8fa8-bc4028b800de",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:27:03.576206+00:00",
        "updated_at": "2026-08-31T04:33:48.861995+00:00",
        "native_name": "槍",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "c25bf955-2ee9-480d-a265-6d591228ce65",
        "discontinued_at": null,
        "collector_number": "050",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 50,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000050"
      }
    },
    {
      "scope": "printings",
      "identity": "65ce4679-d7b1-48b4-a747-2e18cf57847f",
      "payload": {
        "id": "65ce4679-d7b1-48b4-a747-2e18cf57847f",
        "artist": null,
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "d3aeeb9c-841e-4088-8fa8-bc4028b800de",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:27:05.861402+00:00",
        "updated_at": "2026-08-31T04:33:48.775655+00:00",
        "native_name": "jigglypuff",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "5c688f3f-678e-4e8e-84d3-c5ddaf5db6d4",
        "discontinued_at": null,
        "collector_number": "051",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 51,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000051"
      }
    },
    {
      "scope": "printings",
      "identity": "73c8c54f-ca86-411d-bc34-437d6bbae88a",
      "payload": {
        "id": "73c8c54f-ca86-411d-bc34-437d6bbae88a",
        "artist": null,
        "set_id": "b5ef438a-ddcb-4093-8c9b-572639565af5",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "b92f9cd1-5e40-4b96-b021-49425d5f3b74",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:28:00.351836+00:00",
        "updated_at": "2026-08-31T04:34:14.662203+00:00",
        "native_name": "デューゴン（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "45cd71b2-2828-448f-9297-e72a5acfb660",
        "discontinued_at": null,
        "collector_number": "048",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 48,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000048"
      }
    },
    {
      "scope": "printings",
      "identity": "826abe37-5568-4559-b3e2-da9cc4e29658",
      "payload": {
        "id": "826abe37-5568-4559-b3e2-da9cc4e29658",
        "artist": null,
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:26:14.910403+00:00",
        "updated_at": "2026-08-31T04:33:32.286278+00:00",
        "native_name": "ホロンアドベンチャー",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "516bfc5e-f527-4a47-9160-f54197e7a8f8",
        "discontinued_at": null,
        "collector_number": "050",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 50,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000050"
      }
    },
    {
      "scope": "printings",
      "identity": "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5",
      "payload": {
        "id": "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5",
        "artist": null,
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:27:18.731443+00:00",
        "updated_at": "2026-08-31T04:33:57.987779+00:00",
        "native_name": "二重虹のエネルギー",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "a163a876-11d7-41c8-bb77-5dc74195b28e",
        "discontinued_at": null,
        "collector_number": "075",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 75,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000075"
      }
    },
    {
      "scope": "printings",
      "identity": "d9d4cb1b-0b22-4753-98f2-181298f22a07",
      "payload": {
        "id": "d9d4cb1b-0b22-4753-98f2-181298f22a07",
        "artist": null,
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "bed84eca-bf58-47d5-94db-3714d513b38f",
        "supertype": "Pokémon",
        "created_at": "2026-08-06T21:26:04.789887+00:00",
        "updated_at": "2026-08-31T04:33:27.73531+00:00",
        "native_name": "ゆっくり（デルタ種）",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "61990617-6f6d-41d1-acc7-cb829b3cb93e",
        "discontinued_at": null,
        "collector_number": "040",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 40,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000040"
      }
    },
    {
      "scope": "printings",
      "identity": "e878f64d-e38a-4d38-854b-d0dedb8ecafe",
      "payload": {
        "id": "e878f64d-e38a-4d38-854b-d0dedb8ecafe",
        "artist": null,
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "subtypes": [],
        "game_code": "pokemon",
        "rarity_id": "cf8d9c24-db46-4011-a512-ad2ff060b4ba",
        "supertype": "Trainer",
        "created_at": "2026-08-06T21:27:15.954656+00:00",
        "updated_at": "2026-08-31T04:33:54.502842+00:00",
        "native_name": "キャスト・アウェイ",
        "deprecated_at": null,
        "language_code": "ja",
        "card_concept_id": "faca7430-8e9f-4968-96a2-cb92cbdfba35",
        "discontinued_at": null,
        "collector_number": "068",
        "deprecated_reason": null,
        "source_updated_at": null,
        "english_display_name": null,
        "collector_number_sort": 68,
        "collector_number_prefix": null,
        "collector_number_suffix": null,
        "corrected_by_printing_id": null,
        "collector_number_sort_key": "000000000068"
      }
    },
    {
      "scope": "sets",
      "identity": "421a8323-4094-4c7f-8622-fb6af390becc",
      "payload": {
        "id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "total": 52,
        "set_code": "PCG7",
        "game_code": "pokemon",
        "series_id": null,
        "created_at": "2026-08-05T13:48:54.544+00:00",
        "updated_at": "2026-08-31T04:08:47.049559+00:00",
        "native_name": "ホロンの幻影",
        "region_code": null,
        "release_date": "2006-01-27",
        "deprecated_at": null,
        "display_order": null,
        "language_code": "ja",
        "printed_total": 52,
        "discontinued_at": null,
        "deprecated_reason": null,
        "provider_set_code": "PCG7",
        "source_updated_at": null,
        "corrected_by_set_id": null,
        "english_display_name": null
      }
    },
    {
      "scope": "sets",
      "identity": "b5ef438a-ddcb-4093-8c9b-572639565af5",
      "payload": {
        "id": "b5ef438a-ddcb-4093-8c9b-572639565af5",
        "total": 68,
        "set_code": "PCG9",
        "game_code": "pokemon",
        "series_id": null,
        "created_at": "2026-08-05T13:48:55.595+00:00",
        "updated_at": "2026-08-31T04:08:47.208626+00:00",
        "native_name": "さいはての攻防",
        "region_code": null,
        "release_date": "2006-06-29",
        "deprecated_at": null,
        "display_order": null,
        "language_code": "ja",
        "printed_total": 68,
        "discontinued_at": null,
        "deprecated_reason": null,
        "provider_set_code": "PCG9",
        "source_updated_at": null,
        "corrected_by_set_id": null,
        "english_display_name": null
      }
    },
    {
      "scope": "sets",
      "identity": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
      "payload": {
        "id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "total": 75,
        "set_code": "PCG8",
        "game_code": "pokemon",
        "series_id": null,
        "created_at": "2026-08-05T13:48:55.077+00:00",
        "updated_at": "2026-08-31T04:08:47.062519+00:00",
        "native_name": "きせきの結晶",
        "region_code": null,
        "release_date": "2006-03-10",
        "deprecated_at": null,
        "display_order": null,
        "language_code": "ja",
        "printed_total": 75,
        "discontinued_at": null,
        "deprecated_reason": null,
        "provider_set_code": "PCG8",
        "source_updated_at": null,
        "corrected_by_set_id": null,
        "english_display_name": null
      }
    },
    {
      "scope": "variants",
      "identity": "052ae4a3-808a-4626-90b1-a8947c6eee70",
      "payload": {
        "id": "052ae4a3-808a-4626-90b1-a8947c6eee70",
        "set_id": "b5ef438a-ddcb-4093-8c9b-572639565af5",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:28:00.888439+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:34:14.928112+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "73c8c54f-ca86-411d-bc34-437d6bbae88a",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:b5ef438a-ddcb-4093-8c9b-572639565af5:048:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "048",
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
      "identity": "0bc646ec-08da-4061-b201-ccfdf7e4014b",
      "payload": {
        "id": "0bc646ec-08da-4061-b201-ccfdf7e4014b",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:26:05.253685+00:00",
        "is_default": false,
        "updated_at": "2026-08-31T04:33:28.024053+00:00",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "d9d4cb1b-0b22-4753-98f2-181298f22a07",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:421a8323-4094-4c7f-8622-fb6af390becc:040:holo",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "040",
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
      "identity": "1b73d0d4-dba6-4acf-a068-f1334471af86",
      "payload": {
        "id": "1b73d0d4-dba6-4acf-a068-f1334471af86",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:26:13.557529+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:33:32.472217+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "38e67ba5-019b-405a-9800-6995a3d62393",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:421a8323-4094-4c7f-8622-fb6af390becc:048:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "048",
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
      "identity": "20f763a7-10b5-440b-aea6-88ea38d92e2d",
      "payload": {
        "id": "20f763a7-10b5-440b-aea6-88ea38d92e2d",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "game_code": "pokemon",
        "created_at": "2026-08-06T12:55:16.19498+00:00",
        "is_default": false,
        "updated_at": "2026-08-31T04:33:22.409427+00:00",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "44e54db1-ee82-40e2-9465-c5eb1cc18cdb",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:421a8323-4094-4c7f-8622-fb6af390becc:022:holo",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "022",
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
      "identity": "3ec629ff-2cdc-4ee9-af18-84416f3a5bda",
      "payload": {
        "id": "3ec629ff-2cdc-4ee9-af18-84416f3a5bda",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:27:16.14874+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:33:54.768232+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "e878f64d-e38a-4d38-854b-d0dedb8ecafe",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:d832f428-8d51-4ac0-a3cf-a5d38bddb88d:068:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "068",
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
      "identity": "4a2f5781-18e8-47f3-8306-2bc8e0112d48",
      "payload": {
        "id": "4a2f5781-18e8-47f3-8306-2bc8e0112d48",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:27:04.003747+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:33:49.12067+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "4f98bea0-d418-4443-84bf-07a30281a5d3",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:d832f428-8d51-4ac0-a3cf-a5d38bddb88d:050:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "050",
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
      "identity": "71c383ba-8c07-4106-8286-b8789db9414e",
      "payload": {
        "id": "71c383ba-8c07-4106-8286-b8789db9414e",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:27:03.069195+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:33:48.632272+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "16b33fb8-f25f-46d0-9cdc-3d58c9973093",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:d832f428-8d51-4ac0-a3cf-a5d38bddb88d:048:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "048",
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
      "identity": "a18ce7b9-4b4b-4e25-8d12-800d49b19c0e",
      "payload": {
        "id": "a18ce7b9-4b4b-4e25-8d12-800d49b19c0e",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:26:15.585226+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:33:32.605144+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "826abe37-5568-4559-b3e2-da9cc4e29658",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:421a8323-4094-4c7f-8622-fb6af390becc:050:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "050",
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
      "identity": "c33e36aa-e537-49b8-b508-63064b097899",
      "payload": {
        "id": "c33e36aa-e537-49b8-b508-63064b097899",
        "set_id": "421a8323-4094-4c7f-8622-fb6af390becc",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:26:02.194909+00:00",
        "is_default": false,
        "updated_at": "2026-08-31T04:33:27.387306+00:00",
        "artwork_key": null,
        "finish_code": "holo",
        "printing_id": "48edaa8d-8750-4aeb-a246-73ce4ef1218f",
        "variant_code": "holo",
        "canonical_key": "pokemon:ja:421a8323-4094-4c7f-8622-fb6af390becc:033:holo",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "033",
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
      "identity": "c73b2587-431d-47e1-ac6f-654d5559532f",
      "payload": {
        "id": "c73b2587-431d-47e1-ac6f-654d5559532f",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:27:06.190931+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:33:48.990151+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "65ce4679-d7b1-48b4-a747-2e18cf57847f",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:d832f428-8d51-4ac0-a3cf-a5d38bddb88d:051:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "051",
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
      "identity": "eb6c6e73-dc4c-4a20-a83a-57071ad93969",
      "payload": {
        "id": "eb6c6e73-dc4c-4a20-a83a-57071ad93969",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:27:01.965362+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:33:48.349252+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "40c40f95-7df1-4153-9030-1871ccaf77cf",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:d832f428-8d51-4ac0-a3cf-a5d38bddb88d:047:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "047",
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
      "identity": "f0ddf359-2d96-4bef-b096-1ab9df898aff",
      "payload": {
        "id": "f0ddf359-2d96-4bef-b096-1ab9df898aff",
        "set_id": "d832f428-8d51-4ac0-a3cf-a5d38bddb88d",
        "game_code": "pokemon",
        "created_at": "2026-08-06T21:27:19.000448+00:00",
        "is_default": true,
        "updated_at": "2026-08-31T04:33:58.210084+00:00",
        "artwork_key": null,
        "finish_code": "normal",
        "printing_id": "c2e0e90e-3a4c-4020-89e4-91bcbbdafbe5",
        "variant_code": "normal",
        "canonical_key": "pokemon:ja:d832f428-8d51-4ac0-a3cf-a5d38bddb88d:075:normal",
        "deprecated_at": null,
        "language_code": "ja",
        "discontinued_at": null,
        "image_signature": null,
        "collector_number": "075",
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
 assert.equal(snapshot.length,env==='production'?61:53);return p;
}
test('exact twelve PCG789 null catalogue values and nine normal/three holo defaults',()=>{validateRows(plan,table);assert.equal(rows.length,12);assert.deepEqual(rows.map(r=>knownSource(r.printing_id).defaultFlag),[false,false,false,true,true,true,true,true,true,true,true,true]);for(const r of rows){validatePublishedWitness(r.evidence.source_body,r);assert.equal(r.evidence.source_body.accepted_category,null);assert.equal(r.evidence.source_body.recorded_inventory_category,null);}});

test('direct raw observations and independent root readings reject wrapper and joint hash forgeries',()=>{
 for(let i=0;i<12;i++)for(const change of [
  b=>{b.raw_source_printed_witness.printedNativeName='wrong';},
  b=>{b.root_actual_printed_witness.printedRules='truncated';b.actual_pixel_signature.printedRules='truncated';},
  b=>{b.actual_pixel_signature={actualPrintedObservations:b.actual_pixel_signature};},
  b=>{b.actual_pixel_signature_schema='WRAPPED';},
  b=>{b.raw_source_witness_is_verbatim_certified=true;},
  b=>{b.raw_source_historical_flags.preparationApproved=true;}
 ]){const q=clone(rows[i]),b=q.evidence.source_body;change(b);b.raw_source_printed_witness_canonical_sha256=canonicalHash(b.raw_source_printed_witness);b.root_actual_printed_witness_canonical_sha256=canonicalHash(b.root_actual_printed_witness);b.actual_pixel_signature_canonical_sha256=canonicalHash(b.actual_pixel_signature);q.evidence.queue_controls=clone(b.queue_controls);assert.throws(()=>validatePublishedWitness(b,q));const p=clone(plan),t=clone(table);p.rows[i]=q;t[i].evidence_sha256=canonicalHash(q.evidence);assert.throws(()=>validateRows(p,t));}
});
test('onlyPCG8-075 Energy retains native Trainer/currentcategoryNULL and both ex exclusions',()=>{const i=10,b=rows[i].evidence.source_body,a=b.actual_pixel_signature;assert.equal(a.printedCardClass,'Energy');assert.equal(b.actual_native_category,'Trainer');assert.equal(b.accepted_category,null);assert.equal(b.finite_energy_exception,true);assert.equal((a.printedRules.match(/ポケモンex/g)||[]).length,2);for(const mutate of [b=>b.actual_pixel_signature.printedRules='truncated',b=>b.finite_energy_exception=false,b=>b.actual_native_category='Energy',b=>b.global_trainer_energy_guard_changed=true,b=>b.raw_historical_source_holds=[]]){const q=clone(rows[i]);mutate(q.evidence.source_body);assert.throws(()=>validatePublishedWitness(q.evidence.source_body,q));}for(const r of rows.filter(r=>r.printing_id!==rows[i].printing_id)){const q=clone(r);q.evidence.source_body.finite_energy_exception=true;assert.throws(()=>validatePublishedWitness(q.evidence.source_body,q));}});

test('joint body, scope, default and source forgeries fail even when witness hashes are recomputed',()=>{
 const changes=[r=>{r.language_code='en';},r=>{r.set_code='INVALID';},r=>{r.provider_id='pricecharting:'+knownSource(r.printing_id).productId;},r=>{r.work_type='SHARP';},r=>{r.evidence.asset_variant_id=r.variant_ids[0];},r=>{r.evidence.source_body.accepted_category='Pokemon';},r=>{r.evidence.source_body.actual_printed_ability_logo='wrong';},r=>{r.evidence.source_body.raw_source_witness_not_rewritten=false;},r=>{r.evidence.source_body.actual_pixel_signature.printedNonCollectorIdentifier='No.1';},r=>{r.evidence.source_body.actual_pixel_signature.printedForm='delta';},r=>{const a=r.evidence.source_body.actual_pixel_signature;if(a.attacks.length)a.attacks[0].effect='truncated';else a.printedRules='truncated';},r=>{r.evidence.source_body.actual_pixel_signature.printedPokemonExRule='truncated';},r=>{r.evidence.source_body.actual_pixel_signature.printedNationalDex=1;},r=>{r.evidence.source_body.actual_pixel_signature.printedSetCodeLiteral='INVALID';},r=>{r.evidence.source_body.required_asset_scope.printing_id='wrong';},r=>{r.evidence.source_body.photo_identity_projection.canonicalPrintingId='wrong';},r=>{r.evidence.source_body.current_production_binding.variants[0].is_default=!knownSource(r.printing_id).defaultFlag;},r=>{r.evidence.source_body.current_staging_binding.variants[0].finish_code='first_edition';},r=>{r.evidence.source_body.physical_material_authenticity_verified=true;},r=>{r.evidence.source_body.unlimited_edition_certified=true;},r=>{r.evidence.source_body.vendor_licence_certified=true;},r=>{r.evidence.source_body.source_wide_approval=true;},r=>{r.evidence.source_body.native_optical_gain_claimed=true;},r=>{r.evidence.source_body.provider_metadata_raw={sellerPrices:[12]};},r=>{r.objects[0].sha256='0'.repeat(64);},r=>{r.objects[3].height=9999;}];
 for(let i=0;i<12;i++)for(const mutate of changes){const p=clone(plan),t=clone(table);mutate(p.rows[i]);p.rows[i].evidence.source_body.actual_pixel_signature_canonical_sha256=canonicalHash(p.rows[i].evidence.source_body.actual_pixel_signature);t[i].evidence_sha256=canonicalHash(p.rows[i].evidence);assert.throws(()=>validateRows(p,t));if(canonicalHash(p.rows[i].evidence.source_body)!==canonicalHash(rows[i].evidence.source_body))assert.throws(()=>validatePublishedWitness(p.rows[i].evidence.source_body,p.rows[i]));}
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
test('production61→85 adds exactly twelve printing-shared assets/links and preserves all four sources',async()=>{
 const db=database(),initial=clone(db.state),p=await guardedPlan(db),j=journal();db.failSourceInsert=true;
 await writeMetadata(db,rows,receipt,approval,'production',j,createSourceResolver(p),null,null,createMetadataGuard(p));
 assert.equal(j.assets.length,12);assert.equal(j.links.length,12);assert.equal(j.preservation.new_inactive_provenance_sources,0);assert.deepEqual(j.preservation.created_provenance_sources,[]);
 assert.equal(Object.values(j.preservation.before_counts).reduce((a,b)=>a+b,0),61);assert.equal(Object.values(j.preservation.after_counts).reduce((a,b)=>a+b,0),85);
 assert.deepEqual(db.state.sources,initial.sources);for(const scope of ['printings','variants','names','sets'])assert.deepEqual(db.state[scope],initial[scope]);assert.deepEqual(db.state.assets.slice(0,initial.assets.length),initial.assets);assert.deepEqual(db.state.links.slice(0,initial.links.length),initial.links);
 assert.equal(db.state.assets.find(asset=>asset.asset_type==='card_image').variant_id,null);assert.equal(j.links[0].variant_id,null);
 assert.ok(!db.calls.some(sql=>sql.startsWith('insert into ingest.sources')));
 await assert.rejects(writeMetadata(db,rows,receipt,approval,'production',journal(),createSourceResolver(p),null,null,createMetadataGuard(p)),/before snapshot changed/);
});
test('zero-source staging creates only a temporary Price fixture and returns53 unchanged rows',async()=>{
 const db=database('staging'),initial=clone(db.state),p=await guardedPlan(db,'staging'),j=journal();
 assert.equal(db.state.sources.length,0);assert.ok(db.state.printings.every(printing=>!Object.hasOwn(printing,'printing_discriminator')));
 await rehearse(db,()=>writeMetadata(db,rows,receipt,approval,'staging',j,createSourceResolver(p),null,null,createMetadataGuard(p)));
 assert.equal(j.preservation.staging_fixture_sources,1);assert.equal(j.preservation.created_provenance_sources[0].code,'pricecharting');assert.equal(j.assets.length,12);assert.equal(j.links.length,12);
 assert.equal(Object.values(j.preservation.before_counts).reduce((a,b)=>a+b,0),53);assert.equal(Object.values(j.preservation.after_counts).reduce((a,b)=>a+b,0),78);assert.deepEqual(db.state,initial);
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
 const result=rollbackReceipt(success,plan),sql=rollbackSql(result);assert.equal(result.assets.length,12);for(let i=0;i<12;i++)assert.equal(result.assets[i].asset_id,assetId(rows[i]));assert.deepEqual(result.retained_inactive_provenance_sources,[]);assert.ok(sql.includes(COHORT_SHA)&&sql.includes('a.variant_id IS NULL'));assert.ok(!sql.includes('DELETE')&&!sql.includes('UPDATE ingest.sources'));
 assert.throws(()=>rollbackReceipt({...success,preservation:{created_provenance_sources:[{code:'pricecharting'}]}},plan));assert.throws(()=>rollbackReceipt({...success,status:'commit_outcome_unknown'},plan));
});
test('protected exact-main confirmation and separated private-output gates remain enforced',()=>{
 const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),STACKR_EXPECTED_MAIN_SHA:'a'.repeat(40),STACKR_ARTWORK_PCG789_WAVES011012013_TWELVE_FRONTS_CONFIRMATION:'PUBLISH ARTWORK PCG789 WAVES011012013 TWELVE FRONTS',STACKR_ARTWORK_PCG789_WAVES011012013_TWELVE_FRONTS_PACKAGES:'/packages',STACKR_ARTWORK_PCG789_WAVES011012013_TWELVE_FRONTS_OUTPUT:'/public',SUPABASE_STAGING_DB_URL:'postgres://postgres@db.lmwfhvexfcoyeuoyrlco.supabase.co/postgres',SUPABASE_DB_URL:'postgres://postgres@db.oakdbbzdqwurpjnoqhmu.supabase.co/postgres'};
 assertConfig(env);for(const mutate of [e=>{e.GITHUB_REF='refs/heads/other';},e=>{e.GITHUB_EVENT_NAME='push';},e=>{e.STACKR_EXPECTED_MAIN_SHA='b'.repeat(40);},e=>{e.STACKR_ARTWORK_PCG789_WAVES011012013_TWELVE_FRONTS_CONFIRMATION='wrong';},e=>{e.STACKR_ARTWORK_PCG789_WAVES011012013_TWELVE_FRONTS_PRIVATE_OUTPUT='/public/private';}]){const changed={...env};mutate(changed);assert.throws(()=>assertConfig(changed));}
});
test('public body rejects commercial captures/private paths and retains exact accepted Japanese witness',()=>{
 for(const value of [{prices:[]},{sellerPrices:[]},{provider_metadata_raw:{}},{file:'D:/private/raw.html'}])assert.throws(()=>publicProjection(value));assert.deepEqual(publicProjection(rows[0].evidence.source_body),rows[0].evidence.source_body);
});

test('existing three production/one stage logos and all nine normal/three holo defaults survive metadata writes and rollback',async()=>{
 for(const env of ['production','staging']){const db=database(env),initial=clone(db.state),p=await guardedPlan(db,env),j=journal();const apply=()=>writeMetadata(db,rows,receipt,approval,env,j,createSourceResolver(p),null,null,createMetadataGuard(p));assert.ok(db.state.variants.every(v=>v.is_default===knownSource(v.printing_id).defaultFlag));if(env==='production'){await apply();assert.deepEqual(db.state.assets.slice(0,initial.assets.length),initial.assets);assert.deepEqual(db.state.links.slice(0,initial.links.length),initial.links);assert.deepEqual(db.state.variants,initial.variants);}else{await rehearse(db,apply);assert.deepEqual(db.state,initial);}}
 for(let i=0;i<12;i++){const db=database(),p=await guardedPlan(db);db.state.variants[i].is_default=!db.state.variants[i].is_default;await assert.rejects(writeMetadata(db,rows,receipt,approval,'production',journal(),createSourceResolver(p),null,null,createMetadataGuard(p)),/before snapshot changed/);assert.ok(!db.calls.some(sql=>sql.startsWith('insert')));}
});
test('all twelve measured LARGE roles retain seven detail/five original and honest8/2 canvas signals',()=>{assert.deepEqual(plan.app_display_expectation.map(e=>e.large_role),["detail-page","original","detail-page","detail-page","detail-page","detail-page","detail-page","original","original","original","detail-page","original"]);assert.equal(rows.filter(r=>knownSource(r.printing_id).sourceHDCanvasSignal).length,8);assert.equal(rows.filter(r=>knownSource(r.printing_id).detailHDCanvasSignal).length,2);const p=clone(plan);p.app_display_expectation[0].large_role='original';assert.throws(()=>validateRows(p,table));for(const r of rows)for(const key of ['native_optical_gain_claimed','provider_native_resolution_certified','physical_finish_certified','vendor_licence_certified']){const q=clone(r);q.evidence.source_body[key]=true;assert.throws(()=>validatePublishedWitness(q.evidence.source_body,q));}});
test('actual full61/53 before fixtures equal frozen production/stage hashes without mock normalisation',async()=>{for(const env of ['production','staging']){const db=database(env),snapshot=await readSnapshot(db,rows,plan.scope_counts[env]);assert.equal(snapshot.length,plan.before_snapshot_counts[env]);assert.equal(snapshotHash(snapshot),plan.before_snapshot_hashes[env]);const j=journal(),initial=clone(db.state);await rehearse(db,()=>writeMetadata(db,rows,receipt,approval,env,j,createSourceResolver(plan),null,null,createMetadataGuard(plan)));assert.deepEqual(db.state,initial);assert.equal(j.preservation.created_assets,12);assert.equal(j.preservation.created_links,12);}});

const reorder=value=>Object.fromEntries(Object.entries(value).reverse());
const ins=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
for(const r of rows)for(const key of ['raw_source_printed_witness','root_actual_printed_witness','actual_pixel_signature']){
 test('reject stale and recomputed insertion order '+r.collector_number+' '+key,()=>{for(const recompute of [false,true]){const q=clone(r);q.evidence.source_body[key]=reorder(q.evidence.source_body[key]);if(recompute)q.evidence.source_body.raw_source_witness_insertion_sha256=ins(q.evidence.source_body[key]);assert.throws(()=>validatePublishedWitness(q.evidence.source_body,q));}});
 const witness=r.evidence.source_body[key];if(witness.attacks.length)test('reject nested attack field order '+r.collector_number+' '+key,()=>{const q=clone(r);q.evidence.source_body[key].attacks[0]=reorder(q.evidence.source_body[key].attacks[0]);assert.throws(()=>validatePublishedWitness(q.evidence.source_body,q));});
}
test('valid JSON parse, clone and independent body copies retain exact witness order',()=>{for(const r of rows)for(const copy of [JSON.parse(JSON.stringify(r)),clone(r)])validatePublishedWitness(copy.evidence.source_body,copy);});
test('separate strict twelve-row validator and external binding remain mandatory frozen inputs',async()=>{const input=JSON.parse(await readFile(new URL('./freeze-inputs.json',import.meta.url)));assert.equal(input.source_evidence.privateSourceContractModuleFileByteSha256,'9f7a132ec7c2e8f508d19d1869836a3cdb9b521e1c0723cde68fc87098ff7f75');assert.equal(input.source_evidence.externalValidatorBindingFileByteSha256,'65e7faabea24c378950eae3e0f9f4b1524888c09c06506444e3e7dd5e0784e90');assert.equal(input.source_evidence.executableValidatorSeparateFromArchive,true);for(const suffix of ['/pcg789-source-contract.mjs','/validator-contract-binding.json'])assert(input.private_inputs.some(p=>p.file.endsWith(suffix)));});

test('rollback refuses partial, duplicate and unrelated success journals',()=>{const success={...journal(),status:'published_manifest_and_public_bytes_verified',revision:'a'.repeat(40),verified_at:'2026-10-16',preservation:{created_provenance_sources:[]},assets:rows.map((r,i)=>({id:'bbbbbbbb-bbbb-4bbb-8bbb-'+String(i+1).padStart(12,'0'),printing_id:r.printing_id,created:true}))};for(const mutate of [j=>j.assets.pop(),j=>j.assets[1]={...j.assets[0]},j=>j.assets[0].printing_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',j=>j.assets[0].id='bad',j=>j.assets[0].created=false]){const j=clone(success);mutate(j);assert.throws(()=>rollbackReceipt(j,plan));}});

test('exact recorded lowercase jigglypuff and additive022holo correction cannot be normalised',()=>{const j=rows.find(r=>r.set_code==='PCG8'&&r.collector_number==='051');assert.equal(j.evidence.source_body.queue_controls.identity_controls.canonical_english_label_preserved,'jigglypuff');assert.equal(rows[0].evidence.source_body.current_production_binding.variants[0].finish_code,'holo');assert.equal(rows[0].evidence.source_body.current_production_binding.variants[0].is_default,false);assert(rows[0].evidence.source_body.root_additive_tuple_qualification);for(const mutate of [r=>{r.evidence.source_body.queue_controls.identity_controls.canonical_english_label_preserved=null;},r=>{r.evidence.source_body.queue_controls.identity_controls.canonical_english_label_preserved='Jigglypuff';},r=>{r.evidence.source_body.current_production_binding.printing.english_display_name='Jigglypuff';}]){const r=clone(j);mutate(r);assert.throws(()=>validatePublishedWitness(r.evidence.source_body,r));}});
