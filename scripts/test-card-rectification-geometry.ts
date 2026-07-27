import assert from 'node:assert/strict';
import type { CardFrameAnalyserCorners } from '../lib/cardVisionFrameAnalyser';
import {
  DEFAULT_CARD_ROI_MANIFEST,
  buildCardRectificationRequest,
  mapPreviewRectToRectifiedPhotoCorners,
  mapRectificationPreviewCornersToPhotoCorners,
  normalisedCornersToPreviewCorners,
  orientationToRotationDegrees,
  roiToPixelRect,
} from '../lib/cardRectification';

function nearlyEqual(actual: number, expected: number, epsilon = 0.0001) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

const acceptedCorners: CardFrameAnalyserCorners = {
  topLeft: { x: 0.1, y: 0.1 },
  topRight: { x: 0.9, y: 0.12 },
  bottomRight: { x: 0.88, y: 0.92 },
  bottomLeft: { x: 0.12, y: 0.9 },
};

assert.equal(orientationToRotationDegrees('portrait'), 0);
assert.equal(orientationToRotationDegrees('landscape-left'), 90);
assert.equal(orientationToRotationDegrees('portrait-upside-down'), 180);
assert.equal(orientationToRotationDegrees('landscape-right'), 270);
assert.equal(orientationToRotationDegrees('landscapeLeft'), 90);
assert.equal(orientationToRotationDegrees('landscapeRight'), 270);

const previewCorners = normalisedCornersToPreviewCorners(acceptedCorners, 100, 200);
nearlyEqual(previewCorners.topLeft.x, 10);
nearlyEqual(previewCorners.topLeft.y, 20);
nearlyEqual(previewCorners.bottomRight.x, 88);
nearlyEqual(previewCorners.bottomRight.y, 184);

assert.throws(() => buildCardRectificationRequest({
  scanId: 'front-rejected',
  sourcePhotoUri: 'file:///tmp/front.jpg',
  photoWidth: 1000,
  photoHeight: 2000,
  photoOrientation: 'portrait',
  mirrored: false,
  cameraPosition: 'front',
  previewWidth: 100,
  previewHeight: 200,
  acceptedCorners,
}), /back-camera/);

assert.throws(() => buildCardRectificationRequest({
  scanId: 'mirrored-rejected',
  sourcePhotoUri: 'file:///tmp/mirror.jpg',
  photoWidth: 1000,
  photoHeight: 2000,
  photoOrientation: 'portrait',
  mirrored: true,
  cameraPosition: 'back',
  previewWidth: 100,
  previewHeight: 200,
  acceptedCorners,
}), /back-camera/);

const portraitRequest = buildCardRectificationRequest({
  scanId: 'portrait',
  sourcePhotoUri: 'file:///tmp/portrait.jpg',
  photoWidth: 1000,
  photoHeight: 2000,
  photoOrientation: 'portrait',
  mirrored: false,
  cameraPosition: 'back',
  previewWidth: 100,
  previewHeight: 200,
  previewResizeMode: 'stretch',
  acceptedCorners,
});
const portraitPhoto = mapRectificationPreviewCornersToPhotoCorners(portraitRequest);
nearlyEqual(portraitPhoto.topLeft.x, 100);
nearlyEqual(portraitPhoto.topLeft.y, 200);
nearlyEqual(portraitPhoto.bottomRight.x, 880);
nearlyEqual(portraitPhoto.bottomRight.y, 1840);

const androidLandscapeRequest = {
  ...portraitRequest,
  scanId: 'android-landscape',
  photoOrientation: 'landscapeLeft' as const,
  rotationDegrees: 90 as const,
  photoWidth: 1000,
  photoHeight: 2000,
  previewWidth: 200,
  previewHeight: 100,
  previewCorners: {
    topLeft: { x: 20, y: 10 },
    topRight: { x: 180, y: 12 },
    bottomRight: { x: 176, y: 92 },
    bottomLeft: { x: 24, y: 90 },
  },
};
const androidLandscapePhoto = mapRectificationPreviewCornersToPhotoCorners(androidLandscapeRequest);
nearlyEqual(androidLandscapePhoto.topLeft.x, 100);
nearlyEqual(androidLandscapePhoto.topLeft.y, 1800);
assert.ok(androidLandscapePhoto.bottomLeft.x > androidLandscapePhoto.topLeft.x);

const iosLandscapeRequest = {
  ...androidLandscapeRequest,
  scanId: 'ios-landscape',
  photoOrientation: 'landscapeRight' as const,
  rotationDegrees: 270 as const,
};
const iosLandscapePhoto = mapRectificationPreviewCornersToPhotoCorners(iosLandscapeRequest);
nearlyEqual(iosLandscapePhoto.topLeft.x, 900);
nearlyEqual(iosLandscapePhoto.topLeft.y, 200);
assert.ok(iosLandscapePhoto.topRight.y > iosLandscapePhoto.topLeft.y);

const rotatedCardRequest = buildCardRectificationRequest({
  scanId: 'rotated-card',
  sourcePhotoUri: 'file:///tmp/rotated.jpg',
  photoWidth: 1200,
  photoHeight: 1800,
  photoOrientation: 'portrait',
  mirrored: false,
  cameraPosition: 'back',
  previewWidth: 300,
  previewHeight: 450,
  previewResizeMode: 'stretch',
  acceptedCorners: {
    topLeft: { x: 0.2, y: 0.08 },
    topRight: { x: 0.86, y: 0.2 },
    bottomRight: { x: 0.75, y: 0.91 },
    bottomLeft: { x: 0.12, y: 0.78 },
  },
});
const rotatedPhoto = mapRectificationPreviewCornersToPhotoCorners(rotatedCardRequest);
assert.notEqual(rotatedPhoto.topLeft.y, rotatedPhoto.topRight.y);
assert.notEqual(rotatedPhoto.bottomLeft.x, rotatedPhoto.topLeft.x);

const severePerspectiveRequest = buildCardRectificationRequest({
  scanId: 'severe-perspective',
  sourcePhotoUri: 'file:///tmp/perspective.jpg',
  photoWidth: 1600,
  photoHeight: 2400,
  photoOrientation: 'portrait',
  mirrored: false,
  cameraPosition: 'back',
  previewWidth: 400,
  previewHeight: 600,
  previewResizeMode: 'stretch',
  acceptedCorners: {
    topLeft: { x: 0.28, y: 0.09 },
    topRight: { x: 0.76, y: 0.17 },
    bottomRight: { x: 0.91, y: 0.92 },
    bottomLeft: { x: 0.09, y: 0.83 },
  },
});
const severePhoto = mapRectificationPreviewCornersToPhotoCorners(severePerspectiveRequest);
assert.ok(severePhoto.topLeft.x < severePhoto.topRight.x);
assert.ok(severePhoto.bottomLeft.x < severePhoto.bottomRight.x);
assert.ok(severePhoto.topLeft.y < severePhoto.bottomLeft.y);

const previewRectPhoto = mapPreviewRectToRectifiedPhotoCorners({
  sourcePhotoUri: 'file:///tmp/rect.jpg',
  photoWidth: 1000,
  photoHeight: 2000,
  photoOrientation: 'portrait',
  rotationDegrees: 0,
  mirrored: false,
  previewWidth: 100,
  previewHeight: 200,
  previewResizeMode: 'stretch',
  previewRect: { x: 10, y: 20, width: 80, height: 160 },
  scanId: 'preview-rect',
});
nearlyEqual(previewRectPhoto.topLeft.x, 100);
nearlyEqual(previewRectPhoto.topLeft.y, 200);
nearlyEqual(previewRectPhoto.bottomRight.x, 900);
nearlyEqual(previewRectPhoto.bottomRight.y, 1800);

const leftEdge = DEFAULT_CARD_ROI_MANIFEST.regions.find((region) => region.id === 'leftEdge');
assert.ok(leftEdge);
const leftEdgePixels = roiToPixelRect(leftEdge, { width: 224, height: 320 });
assert.equal(leftEdgePixels.x, 0);
assert.ok(leftEdgePixels.width > 0 && leftEdgePixels.width < 40);
assert.ok(leftEdgePixels.height > 250);

console.log('card rectification geometry tests passed');
