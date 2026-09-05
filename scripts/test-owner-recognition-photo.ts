import assert from 'node:assert/strict';
import { prepareOwnerRecognitionPhoto, type OwnerPhotoEnvironment } from '../lib/ownerRecognitionPhoto';
import type { CardLocalisationResult } from '../lib/cardLocalisation';

const detection = {
  status: 'confident', requiresManualAdjustment: false, imageSize: { width: 336, height: 448 },
  quadrilateral: { topLeft: { x: 84, y: 44.8 }, topRight: { x: 252, y: 44.8 },
    bottomLeft: { x: 84, y: 403.2 }, bottomRight: { x: 252, y: 403.2 } },
} as CardLocalisationResult;

async function main() {
  const deleted: string[] = [];
  let calls = 0;
  let cleaned = false;
  let sentUri = '';
  const env: OwnerPhotoEnvironment = {
    resize: async () => {
      calls += 1;
      return { uri: `file:///cache/${calls}.jpg`, width: calls === 2 ? 336 : 1200,
        height: calls === 2 ? 448 : 1600, base64: 'test' };
    },
    localise: () => detection,
    rectify: (request) => {
      sentUri = request.sourcePhotoUri;
      assert.equal(request.previewCorners.topLeft.x, 300);
      assert.equal(request.previewCorners.topLeft.y, 160);
      assert.equal(request.previewResizeMode, 'contain');
      return { status: 'success', scanId: request.scanId,
        rectifiedFull: { uri: 'file:///native/full.png', width: 700, height: 1000, role: 'rectified_full', mimeType: 'image/png' } };
    },
    deleteRectification: () => { cleaned = true; },
    deletePhoto: async (uri) => { deleted.push(uri); },
  };
  const result = await prepareOwnerRecognitionPhoto({ uri: 'file:///camera/original.jpg', width: 3000, height: 4000 }, env);
  assert.equal(sentUri, 'file:///cache/1.jpg');
  assert.equal(result.uri, 'file:///cache/3.jpg');
  assert.deepEqual(deleted.sort(), ['file:///cache/1.jpg', 'file:///cache/2.jpg']);
  assert.equal(cleaned, true);
  await assert.rejects(prepareOwnerRecognitionPhoto({ uri: 'file:///camera/original.jpg', width: 1000, height: 1400 },
    { ...env, localise: () => ({ ...detection, status: 'uncertain' }), rectify: () => { throw new Error('must not rectify'); } }), /Card edges/);
  await assert.rejects(prepareOwnerRecognitionPhoto({ uri: 'file:///camera/original.jpg', width: 1000, height: 1400 },
    { ...env, rectify: () => ({ status: 'skipped', scanId: null }) }), /native owner build/);
  console.log('Owner recognition photo geometry, cleanup and fail-closed tests passed.');
}
void main();
