import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const backendRequire = createRequire(path.resolve('backend/package.json'));
export async function resolve(specifier, context, next) {
  if (specifier === 'sharp') return { url: pathToFileURL(backendRequire.resolve('sharp')).href, shortCircuit: true };
  return next(specifier, context);
}
