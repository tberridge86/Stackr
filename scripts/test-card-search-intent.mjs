import assert from 'node:assert/strict';
import { parseCardSearchIntent } from '../lib/cardSearchIntent.ts';

for (const [query, catalogue, grader, grade] of [['PSA 10 Charizard', 'Charizard', 'PSA', '10'], ['BGS 9.5 Charizard ex', 'Charizard ex', 'BGS', '9.5'], ['ＰＳＡ １０ リザードン', 'リザードン', 'PSA', '10']]) {
  const intent = parseCardSearchIntent(query);
  assert.equal(intent.originalQuery, query);
  assert.equal(intent.catalogueQuery, catalogue);
  assert.deepEqual(intent.grading, [{ grader, grade }]);
}
for (const query of ['151', 'Pikachu 10', 'Charizard 4/102', 'PSA #10 Charizard', 'PSA 10/102 Charizard', 'TAG TEAM']) {
  const intent = parseCardSearchIntent(query);
  assert.equal(intent.catalogueQuery, query);
  assert.deepEqual(intent.grading, []);
}
assert.equal(parseCardSearchIntent('PSA 10').catalogueQuery, '');
console.log('Card search grading intent preserves card identity and number-only queries.');
