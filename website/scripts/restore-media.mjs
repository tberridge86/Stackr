import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const failure = (code, entry) => new Error(`${code}${entry ? ': ' + entry.path : ''}`);

export function validateManifest(value) {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.entries) || !Array.isArray(value.allowedHosts) || value.entries.length > 1000) throw failure('Invalid media manifest');
  const hosts = new Set(value.allowedHosts);
  for (const host of hosts) if (typeof host !== 'string' || !/^[a-z0-9.-]+$/.test(host) || host.includes('..') || /^(?:localhost|.*\.local|\d+(?:\.\d+){3})$/.test(host)) throw failure('Invalid public media host');
  const paths = new Set();
  let total = 0;
  for (const entry of value.entries) {
    if (typeof entry.path !== 'string' || !entry.path || entry.path.includes('\\') || entry.path.includes('\0') || path.posix.isAbsolute(entry.path) || entry.path.split('/').some(part => !part || part === '.' || part === '..') || paths.has(entry.path)) throw failure('Invalid or duplicate media path');
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 || '') || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > 20 * 1024 * 1024 || !Array.isArray(entry.urls) || !entry.urls.length) throw failure('Invalid media identity', entry);
    paths.add(entry.path); total += entry.bytes;
    for (const url of entry.urls) validateUrl(url, hosts);
  }
  if (total > 200 * 1024 * 1024) throw failure('Media manifest exceeds bounded size');
  return {...value, hosts};
}

function validateUrl(value, hosts) {
  let url;
  try { url = new URL(value); } catch { throw failure('Invalid public media URL'); }
  // This official public image endpoint names its S3 object identifier "key".
  const isPublicObjectKey = key => key === 'key' && url.hostname === 'pokemoncard.co.kr' && url.pathname === '/s3.php';
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.has(url.hostname) || [...url.searchParams.keys()].some(key => !isPublicObjectKey(key) && /^(?:token|access_token|signature|sig|key|api_key|authorization|x-amz-.+)$/i.test(key))) throw failure('Unapproved public media URL');
  return url;
}

async function safeDestination(root, relative) {
  const base = path.resolve(root);
  const components = relative.split('/');
  let current = base;
  for (const part of ['', ...components]) {
    if (part) current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || (current !== path.join(base, ...components) && !stat.isDirectory())) throw failure('Refusing symlink or non-directory media path');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return path.join(base, ...components);
}

async function readVerified(file, entry, {missingAllowed = false} = {}) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== entry.bytes) throw failure('Media bytes changed', entry);
    const bytes = await fs.readFile(file);
    if (digest(bytes) !== entry.sha256) throw failure('Media checksum changed', entry);
    return bytes;
  } catch (error) { if (missingAllowed && error.code === 'ENOENT') return null; throw error; }
}

export async function fetchVerified(entry, manifest, fetchImpl = fetch) {
  const errors = [];
  for (const source of entry.urls) {
    try {
      let url = validateUrl(source, manifest.hosts);
      for (let redirects = 0; ; redirects++) {
        const response = await fetchImpl(url.href, {redirect: 'manual', signal: AbortSignal.timeout(30000), headers: {'Accept': 'image/*,application/octet-stream;q=0.9,*/*;q=0.5'}});
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          if (redirects >= 4 || !response.headers.get('Location')) throw failure('Media redirect limit', entry);
          url = validateUrl(new URL(response.headers.get('Location'), url).href, manifest.hosts);
          continue;
        }
        if (response.status !== 200 || !response.body) { await response.body?.cancel(); throw failure('Media unavailable', entry); }
        if (Number(response.headers.get('Content-Length') || 0) > entry.bytes) { await response.body.cancel(); throw failure('Media response exceeds pinned size', entry); }
        const chunks = []; let length = 0;
        try {
          for await (const chunk of response.body) {
            length += chunk.length;
            if (length > entry.bytes) throw failure('Media response exceeds pinned size', entry);
            chunks.push(chunk);
          }
        } catch (error) { await response.body.cancel().catch(() => {}); throw error; }
        const bytes = Buffer.concat(chunks);
        if (length !== entry.bytes || digest(bytes) !== entry.sha256) throw failure('Downloaded media identity changed', entry);
        return bytes;
      }
    } catch (error) { errors.push(error.message); }
  }
  throw failure('All pinned media origins failed', entry);
}

export async function restoreMedia(manifestValue, options = {}) {
  const manifest = validateManifest(manifestValue);
  const root = path.resolve(options.root || fileURLToPath(new URL('..', import.meta.url)));
  const concurrency = options.concurrency ?? 4;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) throw failure('Concurrency must be between 1 and 8');
  const result = {entries: manifest.entries.length, verified: 0, restored: 0, missing: [], failed: []};
  let next = 0;
  async function processEntry(entry) {
    const destination = await safeDestination(root, entry.path);
    if (await readVerified(destination, entry, {missingAllowed: true})) { result.verified++; return; }
    if (!options.restore) { result.missing.push(entry.path); return; }
    let bytes;
    if (options.from) bytes = await readVerified(await safeDestination(options.from, entry.path), entry, {missingAllowed: true});
    if (!bytes && options.cacheDir) bytes = await readVerified(await safeDestination(options.cacheDir, entry.sha256), entry, {missingAllowed: true});
    if (!bytes && options.offline) { result.missing.push(entry.path); return; }
    if (!bytes) bytes = await fetchVerified(entry, manifest, options.fetchImpl);
    await fs.mkdir(path.dirname(destination), {recursive: true});
    await safeDestination(root, entry.path);
    const temporary = destination + '.restore-' + randomUUID();
    try {
      await fs.writeFile(temporary, bytes, {flag: 'wx', mode: 0o644});
      try { await fs.link(temporary, destination); }
      catch (error) { if (error.code !== 'EEXIST') throw error; await readVerified(destination, entry); }
    } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    result.restored++;
  }
  await Promise.all(Array.from({length: Math.min(concurrency, manifest.entries.length)}, async () => {
    while (next < manifest.entries.length) {
      const entry = manifest.entries[next++];
      try { await processEntry(entry); }
      catch (error) { result.failed.push({path: entry.path, reason: error.message}); }
    }
  }));
  result.missing.sort(); result.failed.sort((a, b) => a.path.localeCompare(b.path));
  return result;
}

async function cli() {
  const args = process.argv.slice(2), options = {};
  let manifestPath = fileURLToPath(new URL('../media-manifest.json', import.meta.url));
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--restore') options.restore = true;
    else if (arg === '--check') options.restore = false;
    else if (arg === '--offline') options.offline = true;
    else if (['--root', '--from', '--cache-dir', '--concurrency', '--manifest'].includes(arg)) {
      const value = args[++i]; if (!value || value.startsWith('--')) throw failure('Missing option value');
      if (arg === '--manifest') manifestPath = path.resolve(value);
      else options[{'--root': 'root', '--from': 'from', '--cache-dir': 'cacheDir', '--concurrency': 'concurrency'}[arg]] = arg === '--concurrency' ? Number(value) : value;
    } else if (arg === '--help') {
      console.log('node scripts/restore-media.mjs --check | --restore [--offline] [--from SOURCE_ROOT] [--cache-dir SHA256_CACHE] [--concurrency 1..8]');
      return;
    } else throw failure('Unknown media option');
  }
  const result = await restoreMedia(JSON.parse(await fs.readFile(manifestPath, 'utf8')), options);
  console.log(JSON.stringify(result, null, 2));
  if (result.failed.length || result.missing.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) cli().catch(error => { console.error(error.message); process.exitCode = 1; });
