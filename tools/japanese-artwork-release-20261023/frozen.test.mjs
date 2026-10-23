import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadFrozen, validateRows, validateApproval } from './frozen.mjs';
const frozen = await loadFrozen();
const evidence = JSON.parse(await readFile(new URL('./source-evidence.json', import.meta.url)));

test('actual finite release freezes71 original identities and284 object references across both live snapshots', () => {
  assert.equal(frozen.rows.length, 71);
  assert.equal(frozen.receipt.object_references, 284);
  assert.equal(frozen.plan.bindingExpectations.production.length, 96);
  assert.equal(frozen.plan.bindingExpectations.staging.length, 93);
  assert.equal(frozen.plan.scopeCounts.staging.variants, 96);
  assert.equal(frozen.plan.newSources.production.length, 0);
});

test('finite source review rejects different Japanese identity, edition stamp, URL, object role or enlargement', () => {
  for (const mutate of [
    plan => { plan.rows[0].card_native_name = 'different'; },
    plan => { plan.rows[0].image_url = plan.rows[1].image_url; },
    plan => { plan.rows[0].evidence.physical_edition_verified = true; },
    plan => { plan.rows[0].evidence.asset_variant_id = plan.rows[0].variant_ids[0]; },
    plan => { plan.rows[0].objects[1].width = plan.rows[0].objects[0].width + 1; },
    plan => { plan.rows[0].objects[0].sha256 = '0'.repeat(64); },
    plan => { plan.rows.pop(); },
  ]) { const plan = structuredClone(frozen.plan); mutate(plan); assert.throws(() => validateRows(plan, evidence)); }
  const stamped = structuredClone(evidence); stamped.cards[0].visibleEdition = 'first_edition';
  assert.throws(() => validateRows(frozen.plan, stamped), /unstamped/);
});

test('owner approval stays finite with no source activation, added spend or physical-edition certificate', () => {
  for (const field of ['source_wide_approval','source_activation','vendor_licence_verified','physical_finish_verified','physical_edition_verified','animation']) assert.throws(() => validateApproval({ ...frozen.approval, [field]: true }));
  assert.throws(() => validateApproval({ ...frozen.approval, additional_provider_spend: 1 }));
  assert.throws(() => validateApproval({ ...frozen.approval, cohort_sha256: '0'.repeat(64) }));
});
