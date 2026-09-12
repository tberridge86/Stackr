from pathlib import Path
import hashlib
import os
import subprocess

assert os.environ.get('GITHUB_REPOSITORY') == 'tberridge86/Stackr'
assert os.environ.get('GITHUB_REF') == 'refs/heads/agent/release/card-first-browse-ui'
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == os.environ['GITHUB_SHA']
assert not subprocess.check_output(['git', 'status', '--porcelain'], text=True).strip()
outputs = {}
def edit(name, before, after, replacements, append=''):
    target = Path(name)
    data = target.read_bytes()
    assert hashlib.sha256(data).hexdigest() == before, name
    text = data.decode('utf-8')
    for old, new, count in replacements:
        assert text.count(old) == count, (name, old)
        text = text.replace(old, new)
    text += append
    assert hashlib.sha256(text.encode()).hexdigest() == after, 'Output hash: ' + name
    outputs[target] = text

edit('scripts/test-home-collector-sections.ts',
 '00613c745c1e79f310840ca236561b15096fddfa4acaca350d4eab27e1db00f3',
 '42d26f300f5070693a2003e03def419f4e2e2a911e1a146e27dee37a44d12551',
 [("assert.ok(homeSource.indexOf('<ValueTrackerCard') < homeSource.indexOf('<HomeCollectionHero'), 'Value summary must precede binder content.');", "assert.ok(homeSource.indexOf('<HomeCollectionHero') < homeSource.indexOf('<ValueTrackerCard'), 'Collection content must precede optional value detail.');", 1)])
anchor = '  const isReadOnly = routeReadOnly || (Boolean(binder) && (!isOwner || !ownershipReady));\n'
helper = '''
  // Match the existing QuickActionSheet dismissal protocol before opening a second modal.
  const pendingBinderOptionAction = useRef<(() => void) | null>(null);
  const flushBinderOptionAction = useCallback(() => {
    const action = pendingBinderOptionAction.current;
    pendingBinderOptionAction.current = null;
    action?.();
  }, []);
  const runAfterBinderOptionsClose = (action: () => void) => {
    if (pendingBinderOptionAction.current) return;
    if (!sortDropdownOpen) { action(); return; }
    pendingBinderOptionAction.current = action;
    setSortDropdownOpen(false);
  };
  useEffect(() => {
    if (sortDropdownOpen || Platform.OS === 'ios') return;
    const timer = setTimeout(flushBinderOptionAction, Platform.OS === 'web' ? 0 : 350);
    return () => clearTimeout(timer);
  }, [sortDropdownOpen, flushBinderOptionAction]);
  useEffect(() => () => { pendingBinderOptionAction.current = null; }, [binderId, userId, isReadOnly]);
'''
edit('features/binder/BinderDetailScreen.tsx',
 '22586e6ab35ffdc6eb49bb7773abb01134312078cf70dba1ea5f476a3cedab13',
 'c610abf8f58b4ba07683bc5c112138aa9cfd97f49f1097c5d72a90b2d8a6c663', [
 (anchor, anchor + helper, 1),
 ('        onPress={() => openCardDetail(item)}\n        onLongPress={() => handleCardLongPress(item)}', '        onPress={() => runAfterBinderOptionsClose(() => openCardDetail(item))}\n        onLongPress={() => runAfterBinderOptionsClose(() => handleCardLongPress(item))}', 1),
 ('title="Binder options" onClose={() => setSortDropdownOpen(false)}', 'title="Binder options" onClose={() => setSortDropdownOpen(false)} onDismiss={flushBinderOptionAction}', 1),
 ('onPress={() => { setSortDropdownOpen(false); handleScanCard(); }}', 'onPress={() => runAfterBinderOptionsClose(handleScanCard)}', 2),
 ('onPress={() => { setSortDropdownOpen(false); setShowAddModal(true); }}', 'onPress={() => runAfterBinderOptionsClose(() => setShowAddModal(true))}', 1),
 ("style={{ alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8 }}", "style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 }}", 1),
 ('                  marginTop: 8,\n                  minHeight: 36,', '                  marginTop: 8,\n                  minHeight: 44,', 1),
])
edit('app/(tabs)/binder.tsx',
 '9bb2c5981ad69ca606f38b60989fb8e53374370cdbf376a9a5cbfa977b8cf036',
 '114f54bbae24b85d4332ccdf5bc6fa3cae6ca79f2e1b1858e605536c2eb631ad', [
 ("import { StackrActionButton } from '../../components/StackrActionButton';\n", '', 1),
 ('  const heroTitleWidth = Math.min(238, Math.max(204, width - PADDING * 2 - 116));\n', '', 1),
])
regression = r'''

test('binder options defer native-modal actions, ignore duplicate taps and flush only once', () => {
  const file = ts.createSourceFile('binder.tsx', read('features/binder/BinderDetailScreen.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(['pendingBinderOptionAction', 'flushBinderOptionAction', 'runAfterBinderOptionsClose']);
  const statements = [];
  function walk(node) {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => names.has(d.name.getText(file)))) statements.push(node.getText(file));
    ts.forEachChild(node, walk);
  }
  walk(file);
  assert.equal(statements.length, 3);
  const code = ts.transpileModule(`${statements.join('\n')}\nexports.flush = flushBinderOptionAction; exports.run = runAfterBinderOptionsClose;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  let closes = 0, calls = 0;
  const context = { exports: {}, sortDropdownOpen: true, useRef: (current) => ({ current }), useCallback: (fn) => fn, setSortDropdownOpen: (value) => { assert.equal(value, false); closes++; } };
  vm.runInNewContext(code, context);
  context.exports.run(() => calls++);
  context.exports.run(() => calls += 100);
  assert.equal(closes, 1); assert.equal(calls, 0);
  context.exports.flush(); context.exports.flush();
  assert.equal(calls, 1);
  context.sortDropdownOpen = false;
  context.exports.run(() => calls++); assert.equal(calls, 2);
  assert.ok(read('features/binder/BinderDetailScreen.tsx').includes('onDismiss={flushBinderOptionAction}'));
  assert.ok(read('features/binder/BinderDetailScreen.tsx').includes('[binderId, userId, isReadOnly]'));
});
'''
edit('scripts/test-card-first-ui.cjs',
 '8bf6d111d345475ab34766661ffd8487571ea418778348c7a49478cd214ed1dc',
 'a52674fe11543fc0e193b0bc0a47137bdd4272a95361b1cf255c447cd1a30cd8', [], regression)
for target, text in outputs.items():
    target.write_bytes(text.encode())
subprocess.run(['git', 'add', '--', *[str(path) for path in outputs]], check=True)
subprocess.run(['git', 'diff', '--cached', '--check'], check=True)
subprocess.run(['git', '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', 'Defer binder option actions until native sheet dismissal and align Home order tests'], check=True)
print('Exact UI source:', subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip())
