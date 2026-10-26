import assert from 'node:assert/strict';
import { parseCardSearchIntent } from '../lib/cardSearchIntent';

for (const [input, expected] of [
  ['  Ｐｉｋａｃｈｕ　ｅｘ  ', 'Pikachu ex'],
  ['Charizard\t\n  ex', 'Charizard ex'],
  ['ＰＳＡ　１０　Ｐｉｋａｃｈｕ', 'Pikachu'],
  ['４／１０２', '4/102'],
  ['フシギダネ　ex', 'フシギダネ ex'],
  ['ピカチュウ', 'ピカチュウ'],
  ['皮卡丘', '皮卡丘'],
  ['Nidoran♀ 29/102', 'Nidoran♀ 29/102'],
  ['TAG TEAM', 'TAG TEAM'],
]) {
  const intent = parseCardSearchIntent(input);
  assert.equal(intent.catalogueQuery, expected, `Catalogue query normalization: ${input}`);
  assert.equal(intent.originalQuery, input.trim(), 'Original market query is preserved');
}
assert.deepEqual(parseCardSearchIntent('ＰＳＡ　１０　Ｐｉｋａｃｈｕ').grading, [{ grader: 'PSA', grade: '10' }]);
assert.equal(parseCardSearchIntent('ＰＳＡ　１０／１０２　Ｐｉｋａｃｈｕ').catalogueQuery, 'PSA 10/102 Pikachu',
  'Collector denominators cannot be stripped as slab grades');
console.log('Catalogue intent normalizes width and whitespace without changing original Market text, native names or collector identity.');
