import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type ManifestLogo = {
  setId: string;
  setCode: string;
  assetPath: string;
  sha256: string;
};

const manifestPath = 'assets/rev2/12-traditional-chinese-set-logo/manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  status: string;
  language: string;
  logos: ManifestLogo[];
};

assert.equal(manifest.status, 'owner_selected_in_app_identification');
assert.equal(manifest.language, 'zh-tw');
assert.equal(manifest.logos.length, 6);
assert.equal(new Set(manifest.logos.map((entry) => entry.setId)).size, 6, 'Each candidate needs one exact canonical set identity.');
assert.equal(new Set(manifest.logos.map((entry) => entry.setCode)).size, 6, 'Each candidate needs one exact set code.');

for (const entry of manifest.logos) {
  assert.match(entry.setId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(entry.assetPath, /^assets\/rev2\/12-traditional-chinese-set-logo\/logos\/[a-z0-9]+\.webp$/);
  const absolutePath = resolve(entry.assetPath);
  assert.ok(existsSync(absolutePath), `${entry.assetPath} must be bundled with the review candidate.`);
  const sha256 = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
  assert.equal(sha256, entry.sha256, `${entry.setCode} must retain its reviewed image bytes.`);
}

console.log('Traditional-Chinese review manifest binds six exact canonical set identities to the preserved candidate bytes.');
