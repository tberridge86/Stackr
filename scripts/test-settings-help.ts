import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import * as support from '../lib/supportHelp';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
function load(file: string, dependencies: Record<string, unknown>) {
  const module = { exports: {} as any };
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, require: (name: string) => {
    if (name === 'react') return React;
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return module.exports;
}
async function main() {
  assert.equal(support.searchHelp('prices older')[0]?.id, 'prices');
  assert.equal(support.searchHelp('imaginary-token').length, 0);
  const context = support.supportContext({ cardId: 'exact', setId: 'set', language: 'ja', finish: 'holo', screen: 'Card\ninspection', token: 'SECRET', collection: ['private'] });
  assert(!context.includes('SECRET')); assert(!context.includes('private')); assert(!context.includes('Card\ninspection'));
  assert.notEqual(support.supportDraftKey('A', context), support.supportDraftKey('B', context));
  assert(support.supportEmailUrl('Card & image?', context, '').includes(encodeURIComponent('Card & image?')));

  const storage = new Map<string, string>(); let failSave = false;
  const disk = { getItem: async (key: string) => storage.get(key) ?? null, setItem: async (key: string, value: string) => { if (failSave) throw new Error('disk'); storage.set(key, value); } };
  const { createCardMotionPreference, CARD_MOTION_KEY } = load('lib/cardMotionPreference.ts', { '@react-native-async-storage/async-storage': disk });
  storage.set(CARD_MOTION_KEY, 'true');
  const motion = createCardMotionPreference(disk);
  await motion.hydrate(); assert.equal(motion.getSnapshot().reduced, true);
  await motion.save(false); assert.equal(motion.getSnapshot().reduced, false);
  const reopened = createCardMotionPreference(disk); await reopened.hydrate(); assert.equal(reopened.getSnapshot().reduced, false);
  failSave = true; await assert.rejects(motion.save(true)); assert.equal(motion.getSnapshot().reduced, false); failSave = false;

  let account: any = { id: 'A', email: 'A@example.invalid', identities: [{ provider: 'apple' }] };
  let failEmail = true; const mail: string[] = [];
  const route: string[] = [];
  const common: Record<string, any> = {
    'react-native': { Alert: { alert() {} }, Platform: { OS: 'web', Version: 'test' }, Pressable: 'Pressable', Switch: 'Switch', TextInput: 'TextInput', View: 'View', Linking: { openURL: async (url: string) => { mail.push(url); if (failEmail) throw new Error('mail app unavailable'); } } },
    '@react-native-async-storage/async-storage': disk,
    'expo-constants': { nativeAppVersion: '1.0.4', nativeBuildVersion: 'test' },
    'expo-updates': { updateId: 'support-ref' },
    'expo-router': { useLocalSearchParams: () => ({ cardId: 'exact', language: 'ja' }), useRouter: () => ({ push: (value: string) => route.push(value) }), useFocusEffect: (work: () => void) => React.useEffect(work, []) },
    '../components/UtilityScreen': { UtilityGroup: 'Group', UtilityRow: 'Row', UtilityScreen: 'Screen' },
    '../components/Text': { Text: 'Text' },
    '../components/theme-context': { useTheme: () => ({ theme: { colors: { semantic: {}, card: '#fff', text: '#000' } } }) },
    '../components/auth-context': { useAuth: () => ({ user: account, loading: false }) },
    '../lib/supportHelp': support,
    '../lib/haptics': { testStackrHaptics: async () => 'disabled' },
  };
  const Help = load('app/help.tsx', common).default;
  let root!: ReactTestRenderer;
  await act(async () => { root = create(React.createElement(Help)); });
  const messageInput = () => root.root.findByProps({ accessibilityLabel: 'Support message' });
  await act(async () => { messageInput().props.onChangeText('My private report'); });
  const compose = () => root.root.findAllByType('Pressable' as React.ElementType).find(node => node.findAllByType('Text' as React.ElementType).some(child => child.props.children === 'Open email'))!;
  await act(async () => { compose().props.onPress(); });
  assert.equal(messageInput().props.value, 'My private report', 'mail failure must retain the editable draft');
  assert([...storage.values()].includes('My private report'), 'mail failure keeps a stored draft');
  assert(!mail[0].includes('support-ref'), 'diagnostics are opt-in');
  assert(!mail[0].includes('A%40'), 'account email is not silently attached');
  account = { id: 'B' };
  await act(async () => { root.update(React.createElement(Help)); });
  assert.equal(messageInput().props.value, '', 'switching accounts hides the previous draft');
  account = { id: 'A' };
  await act(async () => { root.update(React.createElement(Help)); });
  assert.equal(messageInput().props.value, 'My private report', 'original account can reopen its draft');
  failEmail = false;
  await act(async () => { compose().props.onPress(); });
  assert.equal(messageInput().props.value, 'My private report', 'opening email never clears or marks a draft delivered');
  await act(async () => { root.unmount(); });
  let haptics = true;
  const signOutScopes: string[] = [];
  let buttons: { text: string; onPress?: () => void }[] = [];
  common['react-native'].Alert.alert = (_title: string, _body: string, actions: typeof buttons) => { buttons = actions; };
  common['react-native'].AppState = { addEventListener: () => ({ remove() {} }) };
  common['expo-image'] = { Image: { clearMemoryCache: async () => true, clearDiskCache: async () => true } };
  common['../components/CollectionDataControls'] = { CollectionDataControls: 'Export' };
  common['../components/MintyPreferenceControls'] = { MintyPreferenceControls: 'Minty' };
  common['../lib/authRedirects'] = { getPasswordResetRedirectUrl: () => 'stackr://reset-password' };
  common['../lib/cardMotionPreference'] = { cardMotionPreference: { save: async () => {} }, useCardMotionPreference: () => ({ reduced: false, loaded: true, error: false }) };
  common['../lib/haptics'] = { getStackrHapticsEnabled: () => haptics, hydrateStackrHapticsPreference: async () => haptics,
    saveStackrHapticsEnabled: async (value: boolean) => { if (failSave) throw new Error('disk'); haptics = value; } };
  common['../lib/supabase'] = { supabase: { auth: { getUser: async () => ({ data: { user: account } }),
    signOut: async ({ scope }: { scope: string }) => { signOutScopes.push(scope); return {}; } } } };
  account = { id: 'A', email: 'A@example.invalid', identities: [{ provider: 'apple' }] };
  const Settings = load('app/settings.tsx', common).default;
  await act(async () => { root = create(React.createElement(Settings)); });
  assert.equal(root.root.findAllByProps({ title: 'Send password reset email' }).length, 0, 'provider-only accounts must not be offered a Stackr password reset');
  const hapticSwitch = () => ({ props: root.root.findByProps({ title: 'Touch feedback' }).props.trailing.props });
  failSave = true;
  await act(async () => { hapticSwitch().props.onValueChange(false); });
  assert.equal(hapticSwitch().props.value, true, 'failed save cannot flip the visible or active preference');
  failSave = false;
  await act(async () => { hapticSwitch().props.onValueChange(false); });
  assert.equal(hapticSwitch().props.value, false);
  await act(async () => { root.root.findByProps({ title: 'Sign out other sessions' }).props.onPress(); });
  const oldConfirmation = buttons.find(button => button.text === 'Sign out others')!.onPress!;
  account = { id: 'B', email: 'B@example.invalid', identities: [{ provider: 'email' }] };
  await act(async () => { root.update(React.createElement(Settings)); });
  await act(async () => { oldConfirmation(); });
  assert.equal(signOutScopes.length, 0, 'confirmation from account A must not sign out B');
  assert.equal(root.root.findAllByProps({ title: 'Send password reset email' }).length, 1);
  await act(async () => { root.root.findByProps({ title: 'Sign out other sessions' }).props.onPress(); });
  await act(async () => { buttons.find(button => button.text === 'Sign out others')!.onPress!(); });
  assert.deepEqual(signOutScopes, ['others'], 'the current session stays signed in when revoking other sessions');
  await act(async () => { root.unmount(); });
  console.log('Help search/context, private draft recovery/account isolation, opt-in diagnostics and card-motion persistence passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
