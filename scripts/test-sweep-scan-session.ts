import assert from 'node:assert/strict';
import {
  addSweepScanCandidates,
  addUnresolvedSweepScan,
  clearSweepScanSession,
  confirmSweepScanItem,
  createSweepScanSession,
  getSweepScanSummary,
  removeSweepScanItem,
  selectSweepScanCandidate,
  setSweepScanItemQuantity,
} from '../lib/sweepScanSession';

function candidate(id: string, confidence: number, name = id) {
  return {
    id,
    name,
    set_id: 'set-1',
    set_name: 'Test Set',
    number: id,
    confidence,
  };
}

function main() {
  const session = createSweepScanSession({ scanSessionId: 'sweep-session-test' });
  const first = addSweepScanCandidates(session.scanSessionId, [candidate('card-1', 95)], {
    source: 'manual',
    preventRapidDuplicate: false,
    capturedAt: '2026-08-07T12:00:00.000Z',
  });
  assert.equal(first.action, 'added');
  assert.equal(first.item.status, 'confirmed');

  const secondCopy = addSweepScanCandidates(session.scanSessionId, [candidate('card-1', 96)], {
    source: 'manual',
    preventRapidDuplicate: false,
    capturedAt: '2026-08-07T12:00:01.000Z',
  });
  assert.equal(secondCopy.action, 'incremented');
  assert.equal(secondCopy.item.quantity, 2);

  const duplicate = addSweepScanCandidates(session.scanSessionId, [candidate('card-1', 96)], {
    source: 'auto',
    capturedAt: '2026-08-07T12:00:02.000Z',
  });
  assert.equal(duplicate.action, 'duplicate_ignored');
  assert.equal(duplicate.item.quantity, 2);

  const uncertain = addSweepScanCandidates(
    session.scanSessionId,
    [candidate('card-2', 72), candidate('card-3', 69)],
    {
      source: 'auto',
      capturedAt: '2026-08-07T12:00:10.000Z',
    }
  );
  assert.equal(uncertain.item.status, 'review');
  const selected = selectSweepScanCandidate(session.scanSessionId, uncertain.item.id, 1);
  assert.equal(selected?.items.find((item) => item.id === uncertain.item.id)?.selectedCandidateIndex, 1);
  const confirmed = confirmSweepScanItem(session.scanSessionId, uncertain.item.id);
  assert.equal(confirmed?.items.find((item) => item.id === uncertain.item.id)?.status, 'confirmed');
  const quantityChanged = setSweepScanItemQuantity(session.scanSessionId, uncertain.item.id, 3);
  assert.equal(quantityChanged?.items.find((item) => item.id === uncertain.item.id)?.quantity, 3);

  const unresolved = addUnresolvedSweepScan(session.scanSessionId, {
    source: 'manual',
    capturedAt: '2026-08-07T12:00:20.000Z',
  });
  assert.equal(getSweepScanSummary(unresolved.session).unresolvedItems, 1);
  const cleaned = removeSweepScanItem(session.scanSessionId, unresolved.item.id);
  assert.deepEqual(getSweepScanSummary(cleaned), {
    distinctCards: 2,
    totalCopies: 5,
    confirmedCopies: 5,
    reviewItems: 0,
    unresolvedItems: 0,
  });

  clearSweepScanSession(session.scanSessionId);
  console.log('Sweep scan session tests passed.');
}

main();
