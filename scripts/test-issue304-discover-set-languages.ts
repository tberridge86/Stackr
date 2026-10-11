import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const search = fs.readFileSync('app/(tabs)/search.tsx','utf8');
for (const expected of [
  "key: 'all', label: 'All', flag: '🌐'", "key: 'en', label: 'English', flag: '🇬🇧'",
  "key: 'ja', label: 'Japanese', flag: '🇯🇵'", "key: 'zh-cn', label: 'Simplified Chinese', flag: '🇨🇳'",
  "key: 'zh-tw', label: 'Traditional Chinese', flag: '🇹🇼'", "key: 'ko', label: 'Korean', flag: '🇰🇷'",
]) assert.ok(search.includes(expected), expected);
assert.match(search,/category === 'sets' \? \(/);
assert.match(search,/accessibilityState=\{\{ selected: active \}\}/);
assert.match(search,/searchSetsQuick\(primary, normalisedTerms, selectedLanguage\)/);
assert.match(search,/fetchAllSets\(\{ language, includeAssets: false \}\)/);
assert.match(search,/trimmed\.length < 2 && category === 'sets'/);
assert.match(search,/requestId !== requestRef\.current/);
assert.match(search,/requestRef\.current \+= 1; setFocusedResultLimit\(searchResultWindow\.initialCount\); setSelectedLanguage/);
assert.match(search,/hasMoreFocusedResults = category === 'sets' && visibleResults\.sets\.length > focusedResultLimit/);
assert.match(search,/visibleResults\.sets\.slice\(0, category === 'sets' \? focusedResultLimit/);
assert.match(search,/params: \{ id: set\.id, language: set\.language \?\? selectedLanguage \}/);
assert.match(search,/setErrors\(\{ sets: 'Set results could not be loaded\.' \}\)/);

const detail = fs.readFileSync('app/set/[id].tsx','utf8');
assert.match(detail,/routeLanguageParam/);
assert.match(detail,/const language = requestedLanguage \|\| getRouteSetLanguage\(setId\)/);
const detailAst = ts.createSourceFile('app/set/[id].tsx', detail, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fetchCardsCalls: ts.CallExpression[] = [];
const visit = (node: ts.Node) => {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'fetchCardsForSet') fetchCardsCalls.push(node);
  ts.forEachChild(node, visit);
};
visit(detailAst);
const hasCurrentSetLanguageCall = fetchCardsCalls.some((call) => {
  const [setArgument, optionsArgument] = call.arguments;
  if (!setArgument || !optionsArgument || !ts.isPropertyAccessExpression(setArgument)
    || setArgument.expression.getText(detailAst) !== 'currentSet' || setArgument.name.text !== 'id'
    || !ts.isObjectLiteralExpression(optionsArgument)) return false;
  const language = optionsArgument.properties.find((property): property is ts.PropertyAssignment =>
    ts.isPropertyAssignment(property) && property.name.getText(detailAst) === 'language');
  return Boolean(language && ts.isBinaryExpression(language.initializer)
    && language.initializer.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    && language.initializer.left.getText(detailAst) === 'currentSet.language'
    && language.initializer.right.getText(detailAst) === 'language');
});
assert.ok(hasCurrentSetLanguageCall, 'Set cards must use the resolved set identity and its language, while allowing factual loader options.');
console.log('Issue #304 Discover Sets language filters passed.');
