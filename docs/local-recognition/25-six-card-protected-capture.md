# Six-card protected capture handoff

This handoff opens the first physical-session-separated evaluation; it does not select DINOv2, activate an index, or approve production recognition.

## Capture exactly these cards

The identities come from `deploy/evidence/dinov2-pilot-publication-approved-2026-08-06.json` and `catalogue/zh-cn/151c/reviewed-owned-captures.json`.

| Card | Set and collector number | Original model-selection session | New protected-test session |
| --- | --- | --- | --- |
| Vulpix | `151c` · `037/151` | `Vulpix_1` | `151c-037-protected-session-2` |
| Venonat | `151c` · `048/151` | `venonat_1` | `151c-048-protected-session-2` |
| Magneton | `151c` · `082/151` | `Magneton_1` | `151c-082-protected-session-2` |
| Voltorb | `151c` · `100/151` | `Voltorb_1` | `151c-100-protected-session-2` |
| Seaking | `151c` · `119/151` | `Seaking_1` | `151c-119-protected-session-2` |
| Omanyte | `151c` · `138/151` | `Omanyte_1` | `151c-138-protected-session-2` |

Capture at least one new front image per card to satisfy the manifest's technical two-session rule. Three images per card—normal light, angled/glare and sleeved if available—are the smallest useful diagnostic set. Use the same six physical cards as the original pilot, but start a genuinely new capture session. Do not derive any protected image from an old image.

## Assemble the reviewed root

The approved capture root must contain both the original pilot sessions and the six new session folders. Extend its existing `capture-review-manifest.csv` with the new images. Preserve the existing consent scope and owner statement; do not infer or broaden consent.

In `capture-consent-evidence.json`, keep `reviewedPhysicalCardSessions` and add all six new IDs to it. Also pin the evaluation roles exactly:

```json
{
  "modelSelectionPhysicalCardSessions": [
    "Vulpix_1",
    "venonat_1",
    "Magneton_1",
    "Voltorb_1",
    "Seaking_1",
    "Omanyte_1"
  ],
  "protectedTestPhysicalCardSessions": [
    "151c-037-protected-session-2",
    "151c-048-protected-session-2",
    "151c-082-protected-session-2",
    "151c-100-protected-session-2",
    "151c-119-protected-session-2",
    "151c-138-protected-session-2"
  ]
}
```

These original session IDs are pinned by the checked-in approved-capture import evidence. Case matters, including lowercase `venonat_1`. The manifest builder rejects missing, overlapping, unreviewed or unassigned role sessions.

Every new CSV row must include the image-relative path and SHA-256 plus the identity fields pinned in `ml/data_manifests/protected-six-card-capture-plan-v1.json`. It must remain a real, user-consented, confirmed, reviewed front capture. The manifest builder will reject missing files, hash mismatches, unsupported consent, session/identity collisions and unreviewed rows.

## Build and evaluate

From the repository root in PowerShell, set the paths to the reviewed combined capture root:

```powershell
$CaptureRoot = "D:\Stackr-model-evaluation\protected-six-card"
$ManifestPath = Join-Path $CaptureRoot "protected-evaluation-manifest.json"
$ReportPath = Join-Path $CaptureRoot "protected-dinov2-report.json"

npm run capture:reviewed-manifest -- --root="$CaptureRoot" --out="$ManifestPath"
python -m pip install --requirement ml/requirements-pilot-evaluation.txt
npm run capture:evaluate-dinov2 -- --manifest="$ManifestPath" --root="$CaptureRoot" --out="$ReportPath"
```

Stop if the builder reports `protectedTestEligible: false`. A successful evaluation remains development evidence. Its report must keep `productionAccepted: false`, and the existing model-selection and index release gates remain unchanged.
