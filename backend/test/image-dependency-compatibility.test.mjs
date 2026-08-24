import assert from 'node:assert/strict';
import test from 'node:test';

import { RawImage } from '@huggingface/transformers';
import { Jimp } from 'jimp';
import sharp from 'sharp';

test('patched image dependencies preserve the card fingerprint and recognition input path', async () => {
  const source = await sharp({
    create: {
      width: 80,
      height: 100,
      channels: 3,
      background: '#7c3aed',
    },
  }).jpeg().toBuffer();

  const fingerprintImage = await Jimp.read(source);
  const fingerprintRegion = fingerprintImage
    .clone()
    .crop({ x: 8, y: 10, w: 64, h: 80 })
    .resize({ w: 32, h: 32 })
    .greyscale();

  let sampledPixels = 0;
  fingerprintRegion.scan(0, 0, 32, 32, () => {
    sampledPixels += 1;
  });

  const recognitionImage = await RawImage.fromBlob(new Blob([source], { type: 'image/jpeg' }));

  assert.equal(sampledPixels, 32 * 32);
  assert.equal(recognitionImage.width, 80);
  assert.equal(recognitionImage.height, 100);
});
