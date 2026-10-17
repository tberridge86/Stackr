import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { firstNonEmptyCatalogueRows, withCatalogueReadDeadline } from '../lib/resilientCatalogueRead';
import { throwIfOptionalCatalogueReadAborted } from '../lib/optionalCatalogueEnrichment';

const source = readFileSync('lib/stackrDomainAdapter.ts', 'utf8');
const tree = ts.createSourceFile('adapter.ts', source, ts.ScriptTarget.ESNext, true);
const names = ['fetchStackrSet', 'fetchStackrCardsForSet', 'fetchPreferredStackrCardsForReferences'];
const selected = tree.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''));
assert.equal(selected.length, names.length);
const compiled = ts.transpileModule(selected.map((node) => node.getText(tree)).join('\n'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function main() {
  let hanging = true;
  let calls = 0;
  let optionalCalls = 0;
  let finishLate!: (value: any) => void;
  const signals: AbortSignal[] = [];
  const pending = new Promise<any>((resolve) => { finishLate = resolve; });
  const exports: any = {};
  const facts = { setId: 'exact-ja', cards: [{ id: 'ja-001' }] };
  runInNewContext(compiled, {
    exports, Promise, String, Number, Set, Array, Error, Map,
    PREFERRED_CATALOGUE_READ_TIMEOUT_MS: 12, withCatalogueReadDeadline, firstNonEmptyCatalogueRows,
    throwIfOptionalCatalogueReadAborted, correctedChineseSetContext: (reference: string, language: string) => ({ reference, language }),
    getPokemonSetLanguageFromPrefixedId: () => 'ja', toStackrApiLanguage: (v: unknown) => v,
    toLegacyLanguage: (v: unknown) => v, rememberedSet: () => null, rememberSet: () => {},
    resolveCanonicalStackrSetId: async (_ref: string, _lang: string, _client: unknown, signal: AbortSignal) => {
      signals.push(signal); calls += 1;
      return hanging ? pending : facts.setId;
    },
    fetchCanonicalSetCardFacts: async (_ref: string, _lang: string, _client: unknown, signal: AbortSignal) => {
      signals.push(signal); calls += 1;
      return hanging ? pending : facts;
    },
    stackrCardToLegacyCard: (v: any) => v, stackrSetToLegacySet: (v: any) => v,
    readOptionalCatalogueEnrichment: () => { optionalCalls += 1; throw new Error('Facts must not fetch artwork'); },
  });
  const client = { set: async () => ({ data: { set: { setId: facts.setId, languageCode: 'ja' } } }) };
  const reads = [
    () => exports.fetchStackrSet('exact-ja', 'ja', { includeAssets: false }, client),
    () => exports.fetchStackrCardsForSet('exact-ja', 'ja', client, { includeAssets: false }),
    () => exports.fetchPreferredStackrCardsForReferences(['exact-ja', 'alias-ja'], 'ja', client, { includeAssets: false }),
  ];
  for (const read of reads) {
    await assert.rejects(read(), /catalogue is taking longer/, 'Required facts must reject rather than hang or become a successful empty set.');
  }
  assert.equal(calls, 3, 'An expired facts chain must not dispatch its next alias.');
  assert.ok(signals.every((signal) => signal.aborted), 'Every expired required read forwards cancellation to the transport.');
  finishLate(facts);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 3, 'Late facts cannot continue a timed-out alias chain.');
  hanging = false;
  for (const read of reads) assert.ok(await read(), 'A fresh retry succeeds after an uncooperative request timed out.');
  assert.equal(optionalCalls, 0);
  console.log('Canonical set facts settle on deadline, forward cancellation, reject partial absence and recover on retry.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
