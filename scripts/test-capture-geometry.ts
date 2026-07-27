import assert from 'node:assert/strict';
import {
  createCapturedFrame,
  getCropFromPreviewRect,
  photoPointToCorrectedCardPoint,
  photoPointToPreviewPoint,
  previewPointToPhotoPoint,
  correctedCardPointToPhotoPoint,
} from '../lib/captureGeometry';

function close(actual: number, expected: number, tolerance = 0.75) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function closePoint(actual: { x: number; y: number }, expected: { x: number; y: number }, tolerance = 0.75) {
  close(actual.x, expected.x, tolerance);
  close(actual.y, expected.y, tolerance);
}

function testPortraitCoverMapping() {
  const frame = createCapturedFrame({
    originalUri: 'file://portrait.jpg',
    pixelWidth: 3000,
    pixelHeight: 4000,
    previewWidth: 390,
    previewHeight: 844,
    previewResizeMode: 'cover',
    detectedCardPreviewRect: { x: 105, y: 220, width: 180, height: 251 },
    scanSessionId: 'portrait-test',
  });

  closePoint(previewPointToPhotoPoint(frame, { x: 195, y: 422 }), { x: 1500, y: 2000 });
  closePoint(photoPointToPreviewPoint(frame, { x: 1500, y: 2000 }), { x: 195, y: 422 });
  assert.ok(Object.isFrozen(frame), 'captured frame should be immutable');
  assert.equal(frame.scanSessionId, 'portrait-test');
}

function testLandscapeCoverMapping() {
  const frame = createCapturedFrame({
    originalUri: 'file://landscape.jpg',
    pixelWidth: 4000,
    pixelHeight: 3000,
    previewWidth: 844,
    previewHeight: 390,
    previewResizeMode: 'cover',
    detectedCardPreviewRect: { x: 305, y: 74, width: 234, height: 327 },
    orientation: 'landscapeLeft',
    scanSessionId: 'landscape-test',
  });

  closePoint(previewPointToPhotoPoint(frame, { x: 422, y: 195 }), { x: 2000, y: 1500 });
  closePoint(photoPointToPreviewPoint(frame, { x: 2000, y: 1500 }), { x: 422, y: 195 });
}

function testMirroredPreviewMapping() {
  const frame = createCapturedFrame({
    originalUri: 'file://front-camera.jpg',
    pixelWidth: 1000,
    pixelHeight: 1000,
    previewWidth: 500,
    previewHeight: 500,
    previewResizeMode: 'cover',
    mirrored: true,
    detectedCardPreviewRect: { x: 100, y: 100, width: 300, height: 300 },
    scanSessionId: 'mirror-test',
  });

  closePoint(previewPointToPhotoPoint(frame, { x: 100, y: 250 }), { x: 800, y: 500 });
  closePoint(photoPointToPreviewPoint(frame, { x: 800, y: 500 }), { x: 100, y: 250 });
}

function testRotationMapping() {
  const frame = createCapturedFrame({
    originalUri: 'file://rotated.jpg',
    pixelWidth: 3000,
    pixelHeight: 4000,
    previewWidth: 800,
    previewHeight: 600,
    previewResizeMode: 'cover',
    rotationDegrees: 90,
    detectedCardPreviewRect: { x: 300, y: 160, width: 200, height: 280 },
    scanSessionId: 'rotation-test',
  });

  closePoint(previewPointToPhotoPoint(frame, { x: 400, y: 300 }), { x: 1500, y: 2000 });
  closePoint(photoPointToPreviewPoint(frame, { x: 1500, y: 2000 }), { x: 400, y: 300 });
}

function testEdgeCropUsesStoredPhotoPixels() {
  const frame = createCapturedFrame({
    originalUri: 'file://edge-card.jpg',
    pixelWidth: 1000,
    pixelHeight: 2000,
    previewWidth: 400,
    previewHeight: 800,
    previewResizeMode: 'cover',
    detectedCardPreviewRect: { x: 30, y: 100, width: 70, height: 500 },
    scanSessionId: 'edge-test',
  });
  const crop = getCropFromPreviewRect(frame, { x: 30, y: 100, width: 70, height: 500 }, 0);

  assert.deepEqual(crop, { x: 75, y: 250, width: 175, height: 1250 });
}

function testPerspectiveCorrectedCardMapping() {
  const frame = createCapturedFrame({
    originalUri: 'file://quad.jpg',
    pixelWidth: 700,
    pixelHeight: 1000,
    previewWidth: 350,
    previewHeight: 500,
    previewResizeMode: 'cover',
    detectedCardQuadrilateral: {
      topLeft: { x: 100, y: 200 },
      topRight: { x: 500, y: 180 },
      bottomRight: { x: 520, y: 800 },
      bottomLeft: { x: 90, y: 820 },
    },
    scanSessionId: 'quad-test',
  });

  const photoPoint = correctedCardPointToPhotoPoint(frame, { x: 0.5, y: 0.5 });
  const correctedPoint = photoPointToCorrectedCardPoint(frame, photoPoint);
  closePoint(correctedPoint, { x: 0.5, y: 0.5 }, 0.001);
}

testPortraitCoverMapping();
testLandscapeCoverMapping();
testMirroredPreviewMapping();
testRotationMapping();
testEdgeCropUsesStoredPhotoPixels();
testPerspectiveCorrectedCardMapping();

console.log('capture geometry tests passed');
