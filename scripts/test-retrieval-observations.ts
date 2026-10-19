import assert from 'node:assert/strict';
import {
  beginBinderRetrieval, beginRetrieval, exportRetrievalObservations,
  getBinderRetrievalObservations, resetRetrievalObservations, startBinderRetrieval,
} from '../lib/performance';

resetRetrievalObservations();
let now = 0;
const rows = [{ id: 'private-card' }];
const binder = beginBinderRetrieval(() => now);
now = 20;
binder.model(rows, 'persisted', false);
now = 40;
binder.visible([{ ...rows[0] }]);
assert.equal(getBinderRetrievalObservations()[0].visibleContentMs, null);
binder.committedRows(rows);
binder.visible(rows);
now = 300;
binder.model(rows, 'network', true);
binder.phase('auth-ready');
binder.editable();
binder.settle();
const complete = getBinderRetrievalObservations()[0];
assert.equal(complete.modelReadyMs, 20);
assert.equal(complete.visibleContentMs, 40);
assert.equal(complete.source, 'persisted');
assert.equal(complete.networkCompleteMs, 300);
assert.equal(complete.catalogueComplete, true, 'complete network recovery updates the initial partial model');
binder.cancel();
now = 500;
binder.phase('detail-displayed');
assert.equal(exportRetrievalObservations().observations[0].phasesMs['detail-displayed'], undefined);
assert.equal(exportRetrievalObservations().observations[0].outcome, 'success', 'leaving a completed read is not a failed cancellation');

const failed = beginRetrieval('search', 'input', () => now);
now += 240;
failed.phase('auth-ready');
now += 100;
failed.fail('facts');
failed.settle();
assert.equal(exportRetrievalObservations().observations.at(-1)?.phasesMs['facts-settled'], 340, 'input origin includes the debounce');
assert.equal(exportRetrievalObservations().observations.at(-1)?.settlementScope, 'facts-only');
assert.equal(exportRetrievalObservations().observations.at(-1)?.phasesMs.settled, undefined, 'factual settlement cannot imply completion of optional work');
assert.equal(exportRetrievalObservations().observations.at(-1)?.outcome, 'failure');
failed.facts(2, 'persisted');
assert.equal(exportRetrievalObservations().observations.at(-1)?.outcome, 'partial', 'a delayed saved preview retains the failed refresh');
failed.fail('facts');
assert.deepEqual(exportRetrievalObservations().observations.at(-1)?.failures, ['facts']);

const cancelled = beginRetrieval('search', 'input', () => now);
cancelled.cancel();
cancelled.facts(5, 'network', true);
cancelled.settle();
assert.equal(exportRetrievalObservations().observations.at(-1)?.outcome, 'cancelled');
assert.equal(exportRetrievalObservations().observations.at(-1)?.cards, 0, 'late results cannot repaint a cancelled observation');

startBinderRetrieval('private-binder');
const fromTap = beginBinderRetrieval(undefined, 'private-binder');
fromTap.model(rows, 'memory');
assert.equal(getBinderRetrievalObservations().at(-1)?.start, 'tap');
startBinderRetrieval('other-private-binder');
beginBinderRetrieval(undefined, 'different-binder');
assert.equal(getBinderRetrievalObservations().at(-2)?.cancelled, true, 'a mismatched navigation cannot inherit another tap');
assert.equal(getBinderRetrievalObservations().at(-1)?.start, 'screen-load');

resetRetrievalObservations();
for (let index = 0; index < 300; index++) {
  const trace = beginRetrieval('search', 'retry', () => now);
  if (index % 2) { trace.fail('source'); trace.settle(); } else trace.cancel();
}
const exported = exportRetrievalObservations();
assert.equal(exported.capacity, 256);
assert.equal(exported.observations.length, 256);
assert.equal(exported.droppedObservations, 44, 'bounded retention loss must be explicit');
assert.equal(exported.observations.filter(row => row.outcome === 'failure').length, 128);
assert.equal(exported.observations.filter(row => row.outcome === 'cancelled').length, 128);
exported.observations[0].failures.push('access');
exported.observations[0].phasesMs['detail-displayed'] = 9;
assert.equal(exportRetrievalObservations().observations[0].failures.includes('access'), false);
assert.equal(exportRetrievalObservations().observations[0].phasesMs['detail-displayed'], undefined);
assert.doesNotMatch(JSON.stringify(exported), /private-card|private-binder|https:|query|accountId/);
resetRetrievalObservations();
assert.equal(exportRetrievalObservations().observations.length, 0);
assert.equal(exportRetrievalObservations().droppedObservations, 0);
const previousAccount = beginRetrieval('search', 'input');
resetRetrievalObservations();
const nextAccount = beginRetrieval('search', 'input');
previousAccount.facts(99, 'network', true); previousAccount.phase('facts-committed'); previousAccount.settle();
assert.equal(previousAccount.pending(), false);
assert.equal(exportRetrievalObservations().observations.length, 1);
assert.equal(exportRetrievalObservations().observations[0].cards, 0, 'old-account callbacks cannot populate the new measurement window');
nextAccount.cancel();

resetRetrievalObservations();
const unavailableInspection = beginRetrieval('inspection', 'inspection-request', () => now);
now += 10;
unavailableInspection.image({ phase: 'failed', rendition: 'detail', attempt: 2, terminal: true });
let inspection = exportRetrievalObservations().observations[0];
assert.equal(inspection.outcome, 'failure', 'terminal image exhaustion must settle rather than remain pending');
assert.equal(inspection.settlementScope, 'inspection-image');
assert.equal(inspection.phasesMs.settled, 10);
unavailableInspection.cancel();
assert.equal(exportRetrievalObservations().observations[0].outcome, 'failure', 'dismissal must preserve the failed observation');
const partialInspection = beginRetrieval('inspection', 'inspection-request', () => now);
partialInspection.image({ phase: 'displayed', rendition: 'thumbnail', attempt: 1 });
partialInspection.image({ phase: 'failed', rendition: 'detail', attempt: 2, terminal: true });
inspection = exportRetrievalObservations().observations[1];
assert.equal(inspection.outcome, 'partial', 'a displayed thumbnail remains useful when the detail image fails');
const optionalBinder = beginRetrieval('binder', 'tap', () => now);
optionalBinder.facts(1, 'network', true); optionalBinder.settle();
now += 20; optionalBinder.fail('prices');
const optional = exportRetrievalObservations().observations[2];
assert.equal(optional.settlementScope, 'facts-only');
assert.equal(optional.phasesMs['facts-settled'], 0);
assert.equal(optional.phasesMs.settled, undefined);
assert.equal(optional.outcome, 'partial', 'later optional failure remains visible without implying an all-work completion');
console.log('Retrieval observations: tap/debounce origins, complete recovery, cancellation, privacy and 256-record export bounds passed.');
