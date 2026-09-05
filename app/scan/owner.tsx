import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { StackrBackButton } from '../../components/StackrBackButton';
import { useTheme } from '../../components/theme-context';
import { useAuth } from '../../components/auth-context';
import {
  deleteOwnerCapture, getOwnerRecognitionAccess, identifyOwnerCard, listOwnerCaptures,
  saveOwnerCapture, type OwnerRecognitionAccess,
} from '../../lib/ownerRecognition';
import { OWNER_PRIVATE_RECOGNITION_ENABLED, type OwnerRecognitionResult } from '../../lib/ownerRecognitionCore';
import { prepareOwnerRecognitionPhoto } from '../../lib/ownerRecognitionPhoto';

export default function OwnerRecognitionScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [access, setAccess] = useState<OwnerRecognitionAccess | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Checking private recognition…');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<OwnerRecognitionResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [physicalCardId, setPhysicalCardId] = useState('');
  const [captures, setCaptures] = useState<Awaited<ReturnType<typeof listOwnerCaptures>>>([]);
  const generation = useRef(0);
  const currentPhoto = useRef<string | null>(null);
  const releasePhoto = useCallback(async () => {
    const uri = currentPhoto.current;
    currentPhoto.current = null;
    if (uri && FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory)) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  }, []);

  const checkAccess = useCallback(async () => {
    const turn = ++generation.current;
    setAccess(null); setResult(null); setImageUri(null); setCaptures([]); setSelected(null);
    setBusy(false);
    await releasePhoto();
    if (!OWNER_PRIVATE_RECOGNITION_ENABLED) { setMessage('Private recognition is not included in this build.'); return; }
    if (!user?.id) { setMessage('Sign in with your owner account to scan.'); return; }
    setBusy(true);
    try {
      // Dataset access does not depend on model readiness; owners can still delete
      // their saved photos when the recognition service is offline or rolled back.
      const saved = await listOwnerCaptures(user.id);
      if (turn !== generation.current) return;
      setCaptures(saved);
      const available = await getOwnerRecognitionAccess();
      if (turn !== generation.current || available.ownerId !== user.id) return;
      setAccess(available); setMessage('Ready · SigLIP FP32 · private server processing');
    } catch (error) {
      if (turn === generation.current) setMessage(error instanceof Error ? error.message : 'Private recognition is unavailable.');
    } finally { if (turn === generation.current) setBusy(false); }
  }, [user?.id, releasePhoto]);

  useEffect(() => {
    void checkAccess();
    return () => { generation.current += 1; void releasePhoto(); };
  }, [checkAccess, releasePhoto]);

  async function takePhoto() {
    if (!access || busy) return;
    const turn = generation.current;
    let originalUri: string | null = null;
    setBusy(true); setResult(null); setSelected(null); setImageUri(null);
    try {
      await releasePhoto();
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) throw new Error('Camera permission is required. Enable it in your device settings.');
      const photo = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, exif: false });
      if (photo.canceled) return;
      const asset = photo.assets[0];
      originalUri = asset.uri;
      setMessage('Finding card edges and correcting perspective…');
      const resized = await prepareOwnerRecognitionPhoto(asset);
      if (turn !== generation.current) {
        await FileSystem.deleteAsync(resized.uri, { idempotent: true }); return;
      }
      currentPhoto.current = resized.uri; setImageUri(resized.uri);
      setMessage('Matching your card against the 48,011-reference gallery…');
      const identified = await identifyOwnerCard(resized.uri, access.ownerId);
      if (turn !== generation.current) return;
      setResult(identified);
      setMessage(`Review required · ${(identified.timings.totalMs / 1000).toFixed(1)}s model processing`);
    } catch (error) {
      if (turn === generation.current) setMessage(error instanceof Error ? error.message : 'Recognition failed. No match was accepted.');
    } finally {
      if (originalUri && FileSystem.cacheDirectory && originalUri.startsWith(FileSystem.cacheDirectory)) {
        await FileSystem.deleteAsync(originalUri, { idempotent: true }).catch(() => {});
      }
      if (turn === generation.current) setBusy(false);
    }
  }

  async function saveCapture() {
    if (!access || !result || !imageUri || busy) return;
    const turn = generation.current;
    setBusy(true);
    try {
      await saveOwnerCapture({ ownerId: access.ownerId, imageUri, physicalCardId, result, selectedVariantId: selected });
      if (turn !== generation.current) return;
      const saved = await listOwnerCaptures(access.ownerId);
      if (turn !== generation.current) return;
      setCaptures(saved);
      setMessage('Saved privately on this device. Nothing added to your collection or sent for training.');
      setResult(null); setImageUri(null); await releasePhoto();
    } catch (error) { if (turn === generation.current) setMessage(error instanceof Error ? error.message : 'Capture could not be saved.'); }
    finally { if (turn === generation.current) setBusy(false); }
  }

  function button(label: string, onPress: () => void, disabled = false) {
    return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={{ padding: 14, borderRadius: 12, backgroundColor: theme.colors.card, borderColor: theme.colors.border,
        borderWidth: 1, marginTop: 10, opacity: disabled ? 0.45 : 1 }}>
      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{label}</Text>
    </TouchableOpacity>;
  }

  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
      <StackrBackButton onPress={() => router.back()} />
      <Text style={{ color: theme.colors.text, fontSize: 25, fontWeight: '900', marginTop: 18 }}>Private recognition</Text>
      <Text style={{ color: theme.colors.textSoft, marginVertical: 12 }}>
        Your account only. Internet required. Photographs are sent to your private recognition service for matching and are not retained there.
        Automatic acceptance and auto-add are off.
      </Text>
      <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.text }}>{message}</Text>
      {busy && <ActivityIndicator style={{ margin: 16 }} />}
      {!access && button('Check availability', () => void checkAccess(), busy)}
      {access && button('Photograph my card', () => void takePhoto(), busy)}
      {access && <Text style={{ color: theme.colors.textSoft, marginTop: 8 }}>Fill the frame with the card face, keep it flat and avoid glare. Scores below are cosine similarities, not probabilities.</Text>}
      {imageUri && <Image source={{ uri: imageUri }} style={{ height: 260, marginTop: 16, borderRadius: 12 }} resizeMode="contain" />}
      {result?.candidates.map((candidate) => <View key={candidate.variantId}>
        {button(`${selected === candidate.variantId ? '✓ ' : ''}${candidate.nativeName || candidate.name} · ${candidate.collectorNumber} · ${candidate.language}\n${candidate.setCode || candidate.setId} · ${candidate.variantCode || 'variant unspecified'} · similarity ${candidate.similarity.toFixed(3)}`,
          () => setSelected(candidate.variantId), busy)}
      </View>)}
      {result && <View style={{ marginTop: 18 }}>
        {button('None is correct / save as unresolved', () => setSelected(null), busy)}
        <Text style={{ color: theme.colors.textSoft, marginTop: 16 }}>Optional: save this photo and your reviewed label into your private, on-device dataset. Use the same physical-card label for every photo of that same card. Unresolved photos are not ground truth.</Text>
        <TextInput value={physicalCardId} onChangeText={setPhysicalCardId} maxLength={120}
          placeholder="Physical-card label, e.g. my-pikachu-001" placeholderTextColor={theme.colors.textSoft}
          style={{ color: theme.colors.text, borderColor: theme.colors.border, borderWidth: 1, padding: 14, borderRadius: 12, marginTop: 12 }} />
        {button(selected ? 'Save my confirmed capture' : 'Save unresolved capture', () => void saveCapture(), busy || !physicalCardId.trim())}
      </View>}
      {user?.id && OWNER_PRIVATE_RECOGNITION_ENABLED && <View style={{ marginTop: 24 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '800' }}>My device dataset · {captures.length} captures</Text>
        <Text style={{ color: theme.colors.textSoft, marginVertical: 8 }}>Saved only on this device under your account. Deleting the app may remove it. These captures are not automatically used for model training.</Text>
        {captures.map((capture) => <View key={capture.id}>
          <Text style={{ color: theme.colors.text, marginTop: 12 }}>{capture.physicalCardId} · {capture.reviewStatus}</Text>
          {button('Delete this capture', () => Alert.alert('Delete private capture?', 'The saved photograph and label will be permanently removed from this device.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => {
              const turn = generation.current;
              void deleteOwnerCapture(user.id, capture.id).then(() => listOwnerCaptures(user.id))
                .then((next) => { if (turn === generation.current) setCaptures(next); })
                .catch(() => { if (turn === generation.current) setMessage('Could not delete the capture. Try again.'); });
            } },
          ]), busy)}
        </View>)}
      </View>}
    </ScrollView>
  </SafeAreaView>;
}
