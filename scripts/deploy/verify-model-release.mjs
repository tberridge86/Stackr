import { readFileSync } from 'node:fs';

const requireActive = process.argv.includes('--require-active');
const registry = JSON.parse(readFileSync('ml/models/embedding-model-registry-v1.json', 'utf8'));
const plan = JSON.parse(readFileSync('ml/reports/embedding-index-regeneration-plan.json', 'utf8'));
const selected = registry.models.find((model) => model.modelId === registry.selectedModelId) ?? null;
const blockers = [];

if (!registry.selectedModelId) blockers.push('no_selected_model');
if (!registry.selectedEmbeddingDimensions) blockers.push('no_selected_embedding_dimension');
if (registry.activationStatus !== 'active') blockers.push(`model_registry_${registry.activationStatus}`);
if (!selected?.productionEligible) blockers.push('selected_model_not_production_eligible');
if (selected && selected.license?.status !== 'production_allowed') blockers.push('selected_model_license_not_approved');
if (selected && selected.onnxExportStatus !== 'validated') blockers.push('onnx_export_not_validated');
if (plan.status !== 'ready') blockers.push(...(plan.blockedReasons ?? [`index_plan_${plan.status}`]));
if (plan.shouldActivate !== true) blockers.push('index_activation_not_requested');

const uniqueBlockers = [...new Set(blockers)];
const result = {
  ok: uniqueBlockers.length === 0,
  selectedModelId: registry.selectedModelId,
  selectedEmbeddingDimensions: registry.selectedEmbeddingDimensions,
  indexVersion: plan.indexVersion,
  blockers: uniqueBlockers,
};

console.log(JSON.stringify(result, null, 2));
if (requireActive && !result.ok) process.exit(1);
