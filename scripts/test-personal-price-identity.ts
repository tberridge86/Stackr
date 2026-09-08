import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as graderRegistry from '../lib/graderRegistry';
import { URL } from 'node:url';

async function main() {
  let account: string | null = 'owner-a';
  let priceReads = 0;
  const id = '91be8fc7-b2ed-4169-b41e-0d374e4d466a';
  const dependencies: Record<string, unknown> = {
    './graderRegistry': graderRegistry,
    './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: account ? { user: { id: account } } : null } }) } } },
    './stackrDomainAdapter': {
      resolveStackrSetId: () => { throw new Error('A canonical card must not be re-resolved by its translated set name'); },
      fetchStackrPrice: async (reference: string) => {
        assert.equal(reference, id);
        priceReads += 1;
        return { resolved: { variantId: id, card: { names: { englishDisplay: 'Test', native: 'テスト' },
          set: { setId: 'set', nativeName: 'セット' }, collectorNumber: { value: '1' } } },
          price: { currency: 'GBP', estimates: { central: priceReads, low: null, high: null },
            sample: { sold: 0, total: 0 }, productType: 'raw_card' } };
      },
    },
  };
  const source = fs.readFileSync(new URL('../lib/pricing.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  vm.runInNewContext(compiled, { exports, require: (name: string) => dependencies[name] ?? {}, console });
  const input = { identifier: id, language: 'ja', setName: 'English set display', number: '001' };
  assert.equal((await exports.fetchPokeTraceCardPrice(input)).stackr_central, 1);
  assert.equal((await exports.fetchPokeTraceCardPrice(input)).stackr_central, 1);
  assert.equal(priceReads, 1);
  assert.equal((await exports.fetchPokeTraceCardPrice({ ...input, forceRefresh: true })).stackr_central, 2);
  account = 'owner-b';
  assert.equal((await exports.fetchPokeTraceCardPrice(input)).stackr_central, 3, 'private caches are isolated between accounts');
  account = null;
  assert.equal(await exports.fetchPokeTraceCardPrice(input), null, 'sign-out cannot read the previous private price cache');
  console.log('Canonical price identity, explicit rereads and account cache isolation passed.');
}
void main();
