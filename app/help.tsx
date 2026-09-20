import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Switch, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { UtilityGroup, UtilityRow, UtilityScreen } from '../components/UtilityScreen';
import { Text } from '../components/Text';
import { useTheme } from '../components/theme-context';
import { useAuth } from '../components/auth-context';
import { searchHelp, supportContext, supportDraftKey, supportEmailUrl, SUPPORT_EMAIL, SUPPORT_URL } from '../lib/supportHelp';
import { testStackrHaptics } from '../lib/haptics';

export default function HelpScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { theme } = useTheme();
  const { user, loading } = useAuth();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const context = supportContext(params);
  const key = supportDraftKey(user?.id ?? null, context);
  const activeKey = useRef(key); activeKey.current = key;
  const [draft, setDraft] = useState({ key: '', text: '', ready: false });
  const [diagnostics, setDiagnostics] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const ready = !loading && draft.ready && draft.key === key;
  const text = ready ? draft.text : '';
  const inputStyle = { backgroundColor: theme.colors.card, color: theme.colors.text, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15 };
  const diagnosticText = `App: ${Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? 'development'} (${Constants.nativeBuildVersion ?? 'preview'})\nOS: ${Platform.OS} ${Platform.Version}\nUpdate: ${Updates.updateId ?? 'embedded / preview'}`;

  useEffect(() => {
    if (loading) return;
    let active = true;
    setDiagnostics(false); setMessage(null);
    setDraft({ key, text: '', ready: false });
    void AsyncStorage.getItem(key).then(saved => {
      if (!active) return;
      const initial = params.request === 'deletion' ? 'I would like to request deletion of my Stackr account and associated personal data.\n\n'
        : params.request === 'data' ? 'I have a request about my personal data:\n\n' : '';
      setDraft({ key, text: saved ?? initial, ready: true });
    }).catch(() => {
      if (!active) return;
      setDraft({ key, text: '', ready: true });
      setMessage('The saved draft could not be read. You can write a new message or reopen Help to retry.');
    });
    return () => { active = false; };
  }, [key, loading, params.request]);

  const saveDraft = async (compose: boolean) => {
    if (!ready || busyRef.current || !text.trim()) return;
    busyRef.current = true; setBusy(true);
    const ownerKey = key;
    try {
      await AsyncStorage.setItem(ownerKey, text);
      if (activeKey.current !== ownerKey) return;
      if (compose) {
        await Linking.openURL(supportEmailUrl(text, context, diagnostics ? diagnosticText : ''));
        if (activeKey.current === ownerKey) setMessage('Email composer opened. Your draft stays here. Send it in your email app; Stackr cannot confirm delivery.');
      } else setMessage('Draft saved on this device.');
    } catch {
      if (activeKey.current === ownerKey) setMessage('Could not save the draft or open email. Your text is still here. Try again, or copy it into an email to the address below.');
    } finally { busyRef.current = false; setBusy(false); }
  };

  return <UtilityScreen title="Help">
    <TextInput value={query} onChangeText={setQuery} placeholder="Search scanning, prices, binders…" placeholderTextColor={theme.colors.textSoft} accessibilityLabel="Search help" style={[inputStyle, { marginBottom: 20 }]} />
    <UtilityGroup title="Help articles">
      {searchHelp(query).map(article => <View key={article.id}>
        <UtilityRow title={article.title} onPress={() => setExpanded(expanded === article.id ? null : article.id)} />
        {expanded === article.id ? <Text style={{ padding: 16, fontSize: 15, lineHeight: 23 }}>{article.body}</Text> : null}
      </View>)}
      {!searchHelp(query).length ? <UtilityRow title="No matching article" detail="Try fewer words or contact support below." /> : null}
    </UtilityGroup>
    <UtilityGroup title="Troubleshooting">
      <UtilityRow title="Test touch feedback" onPress={() => { void testStackrHaptics().then(result => Alert.alert('Touch feedback', result === 'disabled' ? 'Touch feedback is off in Settings.' : result === 'requested' ? 'A short vibration was requested. If you felt nothing, check device haptics and Low Power Mode.' : 'Touch feedback is unavailable in this installation.')); }} />
      <UtilityRow title="Login and password recovery" onPress={() => router.push('/login')} />
      <UtilityRow title="Support website" onPress={() => { void Linking.openURL(SUPPORT_URL).catch(() => setMessage('Could not open the support website. Try again when connected.')); }} />
    </UtilityGroup>
    <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: '800', marginBottom: 10 }}>Contact support</Text>
    <Text style={{ color: theme.colors.textSoft, lineHeight: 20, marginBottom: 12 }}>Describe what happened and what you expected. Do not include passwords, payment details or recovery codes.</Text>
    {context ? <Text selectable style={{ marginBottom: 12, lineHeight: 21 }}>{context}</Text> : null}
    <TextInput multiline value={text} editable={ready && !busy} onChangeText={next => setDraft({ key, text: next, ready: true })} maxLength={4000} accessibilityLabel="Support message" placeholder="What happened?" placeholderTextColor={theme.colors.textSoft} style={[inputStyle, { minHeight: 150, textAlignVertical: 'top' }]} />
    <UtilityRow title="Include app diagnostics" detail="App version, operating system and update reference only." trailing={<Switch value={diagnostics} onValueChange={setDiagnostics} accessibilityLabel="Include app diagnostics in email" />} />
    {diagnostics ? <Text selectable style={{ fontSize: 12, lineHeight: 19, marginVertical: 12 }}>{diagnosticText}</Text> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 12 }}>
      {[[false, 'Save draft'], [true, 'Open email']] .map(([compose, label]) => <Pressable key={String(label)} accessibilityRole="button" disabled={!ready || busy || !text.trim()} onPress={() => { void saveDraft(Boolean(compose)); }} style={{ minHeight: 48, padding: 14, borderRadius: 12, backgroundColor: theme.colors.surface, opacity: !ready || busy || !text.trim() ? 0.5 : 1 }}><Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{String(label)}</Text></Pressable>)}
    </View>
    <Text selectable style={{ color: theme.colors.textSoft }}>{SUPPORT_EMAIL}</Text>
    {message ? <Text accessibilityLiveRegion="polite" style={{ marginTop: 12, lineHeight: 21 }}>{message}</Text> : null}
  </UtilityScreen>;
}
