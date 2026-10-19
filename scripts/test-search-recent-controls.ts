import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

// Exercise the production component without loading account or search services.
const file = 'components/search/SearchResults.tsx';
const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = source.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'RecentSearchPill');
assert.ok(declaration);
const module = { exports: {} as any };
const compiled = ts.transpileModule(`${declaration.getText(source)}; module.exports.RecentSearchPill = RecentSearchPill;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
vm.runInNewContext(compiled, {
  module, exports: module.exports, React,
  View: 'View', TouchableOpacity: 'TouchableOpacity', Text: 'Text', Ionicons: 'Icon',
  searchIcons: { recent: 'time-outline' },
  useTheme: () => ({ theme: { colors: { border: '#E4DEED', card: '#FFFFFF', text: '#433650', textSoft: '#696373' } } }),
});
const events: string[] = [];
const pill = module.exports.RecentSearchPill({
  label: 'ピカチュウ · Pikachu', onPress: () => events.push('search'), onRemove: () => events.push('remove'),
}) as React.ReactElement<any>;
assert.equal(pill.type, 'View', 'the shared container must not itself trigger a search');
const controls = React.Children.toArray(pill.props.children) as React.ReactElement<any>[];
assert.equal(controls.length, 2, 'selection and removal have separate sibling controls');
const [select, remove] = controls;
for (const control of controls) {
  assert.equal(control.type, 'TouchableOpacity');
  assert.equal(control.props.accessibilityRole, 'button');
  assert.ok((control.props.style.height ?? control.props.style.minHeight) >= 48);
  assert.ok((control.props.style.width ?? control.props.style.minWidth) >= 48);
  assert.equal(control.props.hitSlop, undefined, 'touch areas do not overlap their sibling');
  assert.ok(!React.Children.toArray(control.props.children).some(child => React.isValidElement(child) && child.type === 'TouchableOpacity'), 'controls are not nested');
}
assert.equal(select.props.accessibilityLabel, 'Search for ピカチュウ · Pikachu');
assert.equal(remove.props.accessibilityLabel, 'Remove ピカチュウ · Pikachu from recent searches');
remove.props.onPress();
assert.deepEqual(events, ['remove'], 'removal cannot also run the recent search');
select.props.onPress();
assert.deepEqual(events, ['remove', 'search'], 'selection retains its original search action');
console.log('Recent searches: separate labelled 48pt controls; remove and select dispatch independently.');
