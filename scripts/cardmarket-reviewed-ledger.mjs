import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const REVIEW_REFERENCE = 'root20261004/provenance235b/fullcohort/querychecks';
const json = path => readFile(path, 'utf8').then(JSON.parse);
const sha256 = value => createHash('sha256').update(value).digest('hex');
async function writeAtomic(path, value) { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.tmp`; await writeFile(temporary, value, 'utf8'); await rename(temporary, path); }

/** Builds reviewed mappings only where a product has one complete candidate and its printing has no other product candidate. */
export function buildCardmarketReviewedLedger(report, manifest, reviewReference = REVIEW_REFERENCE) {
  if (!report || !Array.isArray(report.candidates) || !manifest?.feeds?.products || !manifest?.feeds?.priceGuide) throw Error('Invalid Cardmarket provenance report or retained manifest.');
  const byPrinting = new Map();
  for (const candidate of report.candidates) {
    const group = byPrinting.get(candidate.printingId) ?? []; group.push(candidate); byPrinting.set(candidate.printingId, group);
  }
  const quarantined = [];
  const mappings = [];
  for (const candidate of report.candidates) {
    const group = byPrinting.get(candidate.printingId) ?? [];
    if (group.length !== 1) { quarantined.push({ printingId: candidate.printingId, providerProductId: candidate.providerProductId, reason: 'duplicate_canonical_target', competingProviderProductIds: group.map(item => item.providerProductId).sort((a, b) => a - b) }); continue; }
    if (candidate.providerCategoryId !== 51) { quarantined.push({ printingId: candidate.printingId, providerProductId: candidate.providerProductId, reason: 'provider_category_mismatch', providerCategoryId: candidate.providerCategoryId }); continue; }
    const template = candidate.mappingTemplate;
    if (!template || !candidate.provenance?.rawRecordIds?.length || !candidate.provenance?.payloadHashes?.length) { quarantined.push({ printingId: candidate.printingId, providerProductId: candidate.providerProductId, reason: 'incomplete_provenance' }); continue; }
    mappings.push({
      cardmarketProductId: candidate.providerProductId, cardmarketCategoryId: candidate.providerCategoryId,
      printingId: candidate.printingId, catalogueVersionId: candidate.catalogueVersionId, method: 'reviewed_exact',
      languageEvidence: { ...template.languageEvidence, retainedProductsSha256: manifest.feeds.products.sha256, retainedProductsCreatedAt: manifest.feeds.products.createdAt },
      variantEvidence: template.variantEvidence,
      finishEvidence: { ...template.finishEvidence, scope: 'blended_public_guide_not_exact_finish', retainedPriceGuideSha256: manifest.feeds.priceGuide.sha256, retainedPriceGuideCreatedAt: manifest.feeds.priceGuide.createdAt },
      reviewReference,
    });
  }
  mappings.sort((left, right) => left.cardmarketProductId - right.cardmarketProductId);
  return { ledger: { schemaVersion: 1, mappings }, receipt: { schemaVersion: 1, reviewReference, provenanceRunId: report.provenanceRunId, retainedFeeds: { products: { sha256: manifest.feeds.products.sha256, createdAt: manifest.feeds.products.createdAt }, priceGuide: { sha256: manifest.feeds.priceGuide.sha256, createdAt: manifest.feeds.priceGuide.createdAt } }, candidateCount: report.candidates.length, reviewedMappingCount: mappings.length, quarantinedCount: quarantined.length, quarantined, ledgerSha256: sha256(JSON.stringify({ schemaVersion: 1, mappings })) } };
}

export async function mainCardmarketReviewedLedger(args = process.argv.slice(2)) {
  const value = name => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  const reportPath = value('--report'); const manifestPath = value('--manifest'); const ledgerPath = value('--ledger'); const receiptPath = value('--receipt');
  if (!reportPath || !manifestPath || !ledgerPath || !receiptPath) throw Error('Use --report=<completed provenance export> --manifest=<retained manifest> --ledger=<ignored ledger> --receipt=<committed sanitized receipt>.');
  const { ledger, receipt } = buildCardmarketReviewedLedger(await json(reportPath), await json(manifestPath));
  await Promise.all([writeAtomic(resolve(ledgerPath), `${JSON.stringify(ledger, null, 2)}\n`), writeAtomic(resolve(receiptPath), `${JSON.stringify(receipt, null, 2)}\n`)]);
  console.log(JSON.stringify({ reviewedMappingCount: receipt.reviewedMappingCount, quarantinedCount: receipt.quarantinedCount, ledgerSha256: receipt.ledgerSha256 }));
  return { ledger, receipt };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) mainCardmarketReviewedLedger().catch(error => { console.error(error.message); process.exitCode = 1; });
