import assert from 'node:assert/strict';
import { Buffer } from 'buffer';
import { encode as encodeJpeg } from 'jpeg-js';
import {
  assessBinderPocketImage,
  createBinderPageGridCells,
  getBinderPocketStatusFromCandidates,
  markDuplicatePocketCandidates,
  normalizeBinderPageLayout,
  runWithConcurrency,
  type BinderPagePocketResult,
} from '../lib/binderPageScan';

function makeJpegBase64(width: number, height: number, lumaForPixel: (x: number, y: number) => number) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const luma = lumaForPixel(x, y);
      data[index] = luma;
      data[index + 1] = luma;
      data[index + 2] = luma;
      data[index + 3] = 255;
    }
  }
  return Buffer.from(encodeJpeg({ data, width, height }, 82).data).toString('base64');
}

function makePocket(index: number, cardId: string): BinderPagePocketResult {
  return {
    index,
    row: Math.floor(index / 3),
    column: index % 3,
    status: 'confirmed',
    cropUri: `file://pocket-${index}.jpg`,
    selectedCandidateIndex: 0,
    quality: null,
    source: 'local',
    notes: [],
    candidates: [{
      id: cardId,
      set_id: 'set-a',
      name: `Card ${cardId}`,
      confidence: 92,
    }],
  };
}

function testLayoutNormalisation() {
  assert.equal(normalizeBinderPageLayout(1), 1);
  assert.equal(normalizeBinderPageLayout('5'), 5);
  assert.equal(normalizeBinderPageLayout('not-a-layout'), 3);
  assert.equal(normalizeBinderPageLayout(12), 3);
}

function testGridCellsStayInsidePage() {
  const cells = createBinderPageGridCells(3, { width: 900, height: 1260 });
  assert.equal(cells.length, 9);
  assert.deepEqual(
    cells.map((cell) => `${cell.row}-${cell.column}`),
    ['0-0', '0-1', '0-2', '1-0', '1-1', '1-2', '2-0', '2-1', '2-2']
  );
  for (const cell of cells) {
    assert.ok(cell.crop.x >= 0);
    assert.ok(cell.crop.y >= 0);
    assert.ok(cell.crop.x + cell.crop.width <= 900);
    assert.ok(cell.crop.y + cell.crop.height <= 1260);
  }
  assert.ok(cells[0].crop.width > 270);
  assert.ok(cells[0].crop.height > 380);
}

function testPocketQualityAssessment() {
  const emptyPocket = makeJpegBase64(120, 160, () => 184);
  const emptyQuality = assessBinderPocketImage(emptyPocket);
  assert.equal(emptyQuality.status, 'empty');

  const detailedPocket = makeJpegBase64(120, 160, (x, y) => ((x + y) % 12 < 6 ? 82 : 178));
  const detailedQuality = assessBinderPocketImage(detailedPocket);
  assert.equal(detailedQuality.status, 'usable');

  const missingQuality = assessBinderPocketImage(null);
  assert.equal(missingQuality.status, 'rescan_required');
}

function testStatusFromCandidates() {
  const usableQuality = {
    status: 'usable' as const,
    score: 0.8,
    brightness: 140,
    contrast: 42,
    edgeDensity: 0.12,
    brightRatio: 0,
    darkRatio: 0,
    reason: 'usable',
  };
  assert.equal(getBinderPocketStatusFromCandidates(usableQuality, []), 'unresolved');
  assert.equal(getBinderPocketStatusFromCandidates(usableQuality, [{ id: 'a', name: 'A', confidence: 50 }]), 'possible_match');
  assert.equal(getBinderPocketStatusFromCandidates(usableQuality, [{ id: 'a', name: 'A', confidence: 91 }]), 'confirmed');
  assert.equal(getBinderPocketStatusFromCandidates({ ...usableQuality, status: 'glare_detected' }, [{ id: 'a', name: 'A', confidence: 91 }]), 'glare_detected');
}

function testDuplicateCandidatesMarkedConservatively() {
  const pockets = markDuplicatePocketCandidates([
    makePocket(0, 'same'),
    makePocket(1, 'unique'),
    makePocket(2, 'same'),
  ]);
  assert.equal(pockets[0].status, 'confirmed');
  assert.equal(pockets[1].status, 'confirmed');
  assert.equal(pockets[2].status, 'duplicate_candidate');
  assert.ok(pockets[2].notes.includes('same-card-already-seen-on-page'));
}

async function testConcurrencyLimit() {
  let running = 0;
  let maxRunning = 0;
  const results = await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    return item * 2;
  });
  assert.deepEqual(results, [2, 4, 6, 8, 10]);
  assert.ok(maxRunning <= 2, `Expected max concurrency <= 2, got ${maxRunning}`);
}

async function main() {
  testLayoutNormalisation();
  testGridCellsStayInsidePage();
  testPocketQualityAssessment();
  testStatusFromCandidates();
  testDuplicateCandidatesMarkedConservatively();
  await testConcurrencyLimit();
  console.log('binder page scan helper tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
