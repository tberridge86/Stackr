import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const defaults = {
  model: 'D:/Stackr-model-evaluation/candidate-runs/siglip2-base-patch16-256-20260903-r3f9f96cb-hardened2/artifacts/siglip2-base-patch16-256-vision-fp32.onnx',
  gallery: 'C:/Users/berri/.cache/stackr-candidate-galleries/siglip2-vision-256-768-r3f9f96cb-full-48011-v1',
};
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = /^--(model|gallery|output)=(.+)$/.exec(arg);
  if (arg === '--help') return ['help', true];
  if (arg === '--volume-artifacts') return ['volumeArtifacts', true];
  if (!match) throw new Error('Use --model=PATH, --gallery=PATH, --output=NEW_DIRECTORY or --help.');
  return [match[1], match[2]];
}));
if (args.help) {
  console.log('Verifies pinned local owner recognition artifacts. With --output=NEW_DIRECTORY, creates a minimal Docker build context; otherwise only verifies. --volume-artifacts omits artifacts from the image for a pre-populated /models volume and adds a private health-only bootstrap app. Never uploads, deploys, modifies source artifacts or reads credentials. Optional --model=PATH --gallery=DIR. Output must not exist.');
  process.exit(0);
}

async function digest(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Expected regular artifact file: ' + file);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file, { highWaterMark: 4 * 1024 * 1024 })) hash.update(chunk);
  return { bytes: info.size, sha256: hash.digest('hex') };
}

const gallery = path.resolve(args.gallery || defaults.gallery);
const artifacts = [
  { source: path.resolve(args.model || defaults.model), destination: 'artifacts/model.onnx', bytes: 371916604,
    sha256: 'f01886dd1d66979f44125db8f482639c9c32cf27d4cc3baa6f1b7d55d2d198d7' },
  { source: path.join(gallery, 'candidate-reference-vectors.f32'), destination: 'artifacts/gallery/candidate-reference-vectors.f32', bytes: 147489792,
    sha256: '516043eceb7e9d4a86a1026d567f137ac805ffb51847b0e6f2dfabbedadc430b' },
  { source: path.join(gallery, 'candidate-reference-metadata.jsonl'), destination: 'artifacts/gallery/candidate-reference-metadata.jsonl', bytes: 29760749,
    sha256: '8869b8c9da5c370210bb9ab683898c46f6d8b3f4552d3f952d1ee37d6938afe3' },
];
for (const artifact of artifacts) {
  const actual = await digest(artifact.source);
  if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error('Pinned artifact mismatch: ' + artifact.destination);
}
const summaryPath = path.join(gallery, 'candidate-gallery-summary.json');
const summaryDigest = await digest(summaryPath);
const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
for (const [key, expected] of Object.entries({ modelId: 'siglip2_vision_256_768',
  modelSha256: artifacts[0].sha256, vectorsSha256: artifacts[1].sha256, metadataSha256: artifacts[2].sha256,
  preprocessingSha256: 'cb4a8b410a11bf59ebfe0a07949f07d2489b34cd3e11ca2f6cc1feeaf9dfff82',
  embeddingDimensions: 768, referenceCount: 48011,
})) {
  if (summary[key] !== expected) throw new Error('Gallery summary contract mismatch: ' + key);
}
artifacts.push({ source: summaryPath, destination: 'artifacts/gallery/candidate-gallery-summary.json', ...summaryDigest });

const service = path.join(root, 'recognition-service');
const sourceFiles = ['app/__init__.py', 'app/owner_siglip.py', 'requirements.txt', 'OWNER_SIGLIP_NOTICES.md',
  'licenses/Apache-2.0.txt', 'licenses/TCGDEX-MIT.txt'];
const entries = artifacts.map(({ destination, bytes, sha256 }) => ({ path: destination, bytes, sha256,
  ...(args.volumeArtifacts ? { externalVolume: true } : {}) }));
const generated = new Map();
for (const relative of sourceFiles) generated.set(relative, await readFile(path.join(service, relative)));
let dockerfile = (await readFile(path.join(service, 'Dockerfile'), 'utf8')).replaceAll('\r\n', '\n');
if (!dockerfile.includes('uvicorn app.main:app') || !dockerfile.includes('COPY --chown=stackr:stackr app ./app')) {
  throw new Error('Recognition Dockerfile changed; review owner context derivation.');
}
dockerfile = dockerfile.replace('uvicorn app.main:app', 'uvicorn app.owner_siglip:app')
  .replace('COPY --chown=stackr:stackr app ./app',
    'COPY --chown=stackr:stackr app ./app\nCOPY OWNER_SIGLIP_NOTICES.md /app/OWNER_SIGLIP_NOTICES.md\nCOPY licenses /app/licenses\n'
      + (args.volumeArtifacts ? '' : 'COPY --chown=root:root artifacts /models\n')
      + 'ENV OWNER_SIGLIP_MODEL_PATH=/models/model.onnx OWNER_SIGLIP_GALLERY_DIR=/models/gallery');
if (args.volumeArtifacts) {
  dockerfile = dockerfile.replace('uvicorn app.owner_siglip:app', 'uvicorn ${OWNER_SIGLIP_APP_MODULE:-app.owner_siglip:app}');
  generated.set('app/bootstrap.py', Buffer.from('from fastapi import FastAPI\napp = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)\n@app.get("/health")\ndef health():\n    return {"status": "artifact_bootstrap", "recognitionAvailable": False}\n'));
}
generated.set('Dockerfile', Buffer.from(dockerfile));
generated.set('.dockerignore', Buffer.from('.git\n.env\n.env.*\n__pycache__\n*.pyc\n'));
generated.set('railway.json', Buffer.from(JSON.stringify({
  '$schema': 'https://railway.com/railway.schema.json',
  build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
  deploy: { healthcheckPath: args.volumeArtifacts ? '/health' : '/ready', healthcheckTimeout: 300, restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 3 },
}, null, 2) + '\n'));
for (const [relative, content] of generated) {
  entries.push({ path: relative, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') });
}
entries.sort((a, b) => a.path.localeCompare(b.path, 'en'));
const manifest = { schemaVersion: 1, artifactLocation: args.volumeArtifacts ? 'volume:/models' : 'image:/models', modelVersion: 'siglip2_vision_256_768',
  indexVersion: 'siglip2-vision-256-768-r3f9f96cb-full-48011-v1', files: entries };
const manifestText = JSON.stringify(manifest, null, 2) + '\n';
if (args.output) {
  const output = path.resolve(args.output);
  // A fresh directory prevents accidental overwrite of any existing deployment or source.
  await mkdir(output, { recursive: false });
  for (const artifact of args.volumeArtifacts ? [] : artifacts) {
    const destination = path.join(output, artifact.destination);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(artifact.source, destination);
    const copied = await digest(destination);
    if (copied.sha256 !== artifact.sha256 || copied.bytes !== artifact.bytes) throw new Error('Copied artifact verification failed.');
  }
  for (const [relative, content] of generated) {
    const destination = path.join(output, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, { flag: 'wx' });
  }
  await writeFile(path.join(output, 'owner-recognition-manifest.json'), manifestText, { flag: 'wx' });
}
console.log(JSON.stringify({ verified: true, packaged: Boolean(args.output),
  fileCount: entries.length, totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
  manifestSha256: createHash('sha256').update(manifestText).digest('hex'),
}, null, 2));
