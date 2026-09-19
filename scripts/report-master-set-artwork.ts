import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { mergePreferredSetArtwork } from '../lib/stackrPreferredSetArtwork';
import { resolveCardArtwork } from '../lib/cardArtworkPresentation';
import type { StackrCard } from '../lib/stackrApiV1';

const baseline = '989da7d489d4e127ac80a8798a1bf67367942954';
const raw = fs.readFileSync('.tmp/master-set-artwork/sample.json', 'utf8');
const input = JSON.parse(raw);
const directory = 'docs/releases/evidence/master-set-artwork-20260919';
fs.mkdirSync(directory, { recursive: true });
function functions(source: string, names: string[]) {
  const tree = ts.createSourceFile('input.ts', source, ts.ScriptTarget.Latest, true);
  const declarations = tree.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text ?? '')).map(n => n.getText(tree));
  const code = ts.transpileModule(`${declarations.join('\n')}\nglobalThis.fns = { ${names.join(',')} };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const scope: any = { exports: {}, Map, Set, Boolean, String }; vm.runInNewContext(code, scope); return scope.fns;
}
const oldMerge = functions(execFileSync('git', ['show', `${baseline}:lib/stackrPreferredSetArtwork.ts`], { encoding: 'utf8' }), ['mergePreferredSetArtwork']).mergePreferredSetArtwork;
const oldPrimary = functions(execFileSync('git', ['show', `${baseline}:lib/stackrDomainAdapter.ts`], { encoding: 'utf8' }), ['clean', 'assetUrl', 'firstAsset', 'primaryCardImageAsset']).primaryCardImageAsset;
const coverage: any[] = [], manual: any[] = [], pending: any[] = [], mappings: any[] = [], imageProbes: any[] = [], sets: any[] = [];
for (const sample of input.sets) {
  const cards = new Map<string, StackrCard>();
  for (const row of sample.rows as StackrCard[]) {
    const existing = cards.get(row.cardId);
    if (!existing) cards.set(row.cardId, structuredClone(row));
    else for (const v of row.variants) if (!existing.variants.some(x => x.variantId === v.variantId)) existing.variants.push(v);
  }
  const complete = [...cards.values()];
  let before: StackrCard[] = complete.map(c => ({ ...c, variants: c.variants.map(v => ({ ...v, image: null })) }));
  let after = before;
  let offset = 0;
  for (const receipt of sample.receipts) {
    const rows = sample.rows.slice(offset, offset + receipt.rowCount); offset += receipt.rowCount;
    before = oldMerge(before, rows); after = mergePreferredSetArtwork(after, rows);
  }
  if (offset !== sample.rows.length) throw new Error('Missing exact page boundaries; run probe again');
  let missingFaces = 0, exact = 0, shared = 0, unsafe = 0, missingRenditions = 0, beforeBlank = 0, afterBlank = 0;
  for (const [index, c] of complete.entries()) {
    const assets = c.variants.flatMap(v => v.image ? [v.image] : []);
    const hasFace = assets.length > 0 || resolveCardArtwork(c, sample.assets?.rows ?? []).kind !== 'missing';
    if (!hasFace) {
      missingFaces++;
      const verifiedAbsent = sample.assets?.receipts.some((r: any) => r.printingId === c.cardId && r.rowCount === 0);
      (verifiedAbsent ? manual : pending).push({ cardId: c.cardId, variantIds: c.variants.map(v => v.variantId).join('|'), canonicalIds: c.variants.map(v => v.canonicalId).join('|'),
        language: c.languageCode, setId: c.set.setId, setCode: c.set.setCode, collectorNumber: c.collectorNumber.value,
        distinctions: c.variants.map(v => v.variantCode).join('|'), reason: verifiedAbsent
          ? 'No approved face in complete public card response or exact-printing manifest; one native-language face needed for ordinary finishes.'
          : 'No face returned by set API. Exact-printing manifest could not be read; verify existing approved assets before manual sourcing.' });
    }
    for (const v of c.variants) {
      const art = resolveCardArtwork(c, sample.assets?.rows ?? [], v.variantId);
      if (art.kind === 'exact') exact++;
      if (art.kind === 'shared') shared++;
      if (v.image && art.kind === 'missing') {
        unsafe++;
        mappings.push({ cardId: c.cardId, variantId: v.variantId, canonicalId: v.canonicalId, language: c.languageCode,
          setId: c.set.setId, setCode: c.set.setCode, collectorNumber: c.collectorNumber.value, variant: v.variantCode,
          imageVariantId: v.image.variantId, assetId: v.image.assetId,
          reason: 'Existing alias crosses an edition/special distinction; withheld pending face/marking review, not queued as a new-image need.' });
      }
      if (v.image?.variantId === v.variantId && !v.image.derivatives?.some(d => d.role === 'card-grid' && d.deliveryUrl)) missingRenditions++;
    }
    const oldArt = oldPrimary(before[index], before[index].variants.flatMap(v => v.image ? [v.image] : []));
    const newArt = resolveCardArtwork(after[index]);
    if (!oldArt) beforeBlank++;
    if (newArt.kind === 'missing') afterBlank++;
    coverage.push({ language: c.languageCode, setCode: c.set.setCode, cardId: c.cardId, defaultVariantId: c.defaultVariantId,
      collectorNumber: c.collectorNumber.value, variants: c.variants.length, approvedFacePresent: hasFace,
      beforePreferredBlank: !oldArt, afterPreferredBlank: newArt.kind === 'missing', presentation: newArt.kind,
      sourceVariantId: newArt.sourceVariantId, assetId: newArt.assetId });
  }
  const chosen = complete.filter(c => c.variants.some(v => v.image)).slice(0, 2);
  const external = complete.find(c => c.variants.some(v => v.image?.externallyReferenced));
  if (external && !chosen.includes(external)) chosen.push(external);
  for (const c of chosen) {
    const a = c.variants.find(v => v.image)?.image;
    for (const [role, url] of [['original', a?.deliveryUrl], ['card-grid', a?.derivatives?.find(d => d.role === 'card-grid')?.deliveryUrl]]) {
      if (url) imageProbes.push({ language: c.languageCode, set: c.set.setCode, cardId: c.cardId, role, url });
    }
  }
  sets.push({ language: sample.set.languageCode, setCode: sample.set.setCode, setId: sample.set.setId,
    catalogueVersionId: complete[0]?.catalogueVersionId, pages: sample.receipts.length, paginationComplete: sample.paginationComplete,
    faces: complete.length, variants: complete.reduce((n,c) => n+c.variants.length,0), missingFaces,
    exactAssetAssociations: exact, approvedSharedPresentation: shared, unresolvedEditionMappings: unsafe,
    originalsWithoutGridDerivative: missingRenditions, beforePreferredBlank: beforeBlank, afterPreferredBlank: afterBlank,
    manifestRows: sample.assets?.rows.length ?? null, manifestReadsSucceeded: sample.assets?.receipts.length ?? 0,
    manifestReadsFailed: sample.assets?.errors.length ?? 0, manifestFailures: sample.assets?.errors ?? [] });
}
const csv = (rows: any[]) => {
  const columns = Object.keys(rows[0] ?? { cardId: '', reason: '' });
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [columns.map(escape).join(','), ...rows.map(row => columns.map(c => escape(row[c])).join(','))].join('\n')+'\n';
};
for (const [name, rows] of [['coverage', coverage], ['manual-sourcing-exceptions', manual], ['pending-source-checks', pending], ['mapping-review', mappings]] as const)
  fs.writeFileSync(path.join(directory, `${name}.csv`), csv(rows));
fs.writeFileSync('.tmp/master-set-artwork/image-probes.json', JSON.stringify(imageProbes, null, 2));
const summary = { observedAt: input.observedAt, reportedAt: new Date().toISOString(), baseline,
  api: 'https://api.stackrtcg.com/v1', backend: input.backend, manifest: input.manifest,
  sampleSha256: createHash('sha256').update(raw).digest('hex'), sets,
  manualSourceFaces: manual.length, pendingSourceChecks: pending.length, unresolvedMappings: mappings.length, actualNativeRenderingChecks: 0,
  notes: ['Bounded eight-set sample, not whole-catalogue coverage. Korean unmeasured.',
    'Before/after replay is the preferred progressive artwork path before optional manifest fallback, not measured phone blanks.',
    'Exact counts are approved canonical asset associations, not independently verified finish photographs.',
    'No assets sourced, renditions regenerated, catalogue writes or deployments performed.'] };
fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2)+'\n');
console.log(JSON.stringify({ sets: sets.map(({ manifestFailures, ...set }) => set), manual: manual.length, pending: pending.length, mappings: mappings.length }, null, 2));
