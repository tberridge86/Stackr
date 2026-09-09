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
  saveOwnerCapture, uploadOwnerCapture, type OwnerRecognitionAccess,
} from '../../lib/ownerRecognition';
import { OWNER_PRIVATE_RECOGNITION_ENABLED, type OwnerRecognitionResult, type OwnerTeachingIdentity } from '../../lib/ownerRecognitionCore';
import { prepareOwnerRecognitionPhoto } from '../../lib/ownerRecognitionPhoto';
import { listOwnerTeachingSets, loadOwnerTeachingCard, searchOwnerTeachingCards } from '../../lib/ownerTeachingCatalogue';
import {
  OWNER_TEACHING_LANGUAGES, ownerTeachingIdentityFromCard, ownerTeachingVariantLabel,
  type OwnerTeachingCardChoice, type OwnerTeachingLanguage,
} from '../../lib/ownerTeachingCore';
import type { StackrCard, StackrCardVariant, StackrSet } from '../../lib/stackrApiV1';
import { getPreferredCardDisplayName, getPreferredSetDisplayName } from '../../lib/pokemonDisplayNames';
import { stackrHaptics } from '../../lib/haptics';

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
  const teachingGeneration = useRef(0);
  const currentPhoto = useRef<string | null>(null);
  const [teachingOpen, setTeachingOpen] = useState(false);
  const [teachingLanguage, setTeachingLanguage] = useState<OwnerTeachingLanguage | null>(null);
  const [teachingSetQuery, setTeachingSetQuery] = useState('');
  const [teachingSets, setTeachingSets] = useState<StackrSet[]>([]);
  const [teachingSet, setTeachingSet] = useState<StackrSet | null>(null);
  const [teachingNumber, setTeachingNumber] = useState('');
  const [teachingCards, setTeachingCards] = useState<OwnerTeachingCardChoice[]>([]);
  const [teachingCard, setTeachingCard] = useState<StackrCard | null>(null);
  const [teachingVariants, setTeachingVariants] = useState<StackrCardVariant[]>([]);
  const [teachingCatalogueVersion, setTeachingCatalogueVersion] = useState<string | null>(null);
  const [teachingVariantId, setTeachingVariantId] = useState<string | null>(null);
  const [teachingBusy, setTeachingBusy] = useState(false);
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
    teachingGeneration.current += 1;
    setTeachingOpen(false); setTeachingLanguage(null); setTeachingSets([]); setTeachingSet(null); setTeachingCards([]);
    setTeachingCard(null); setTeachingVariants([]); setTeachingVariantId(null); setTeachingBusy(false);
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
      if (turn !== generation.current) return;
      void stackrHaptics.scannerCaptureLocked();
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
      void stackrHaptics.scannerAmbiguous();
      setMessage(`Review required · ${(identified.timings.totalMs / 1000).toFixed(1)}s model processing`);
    } catch (error) {
      if (turn === generation.current) {
        void stackrHaptics.scannerFailed();
        setMessage(error instanceof Error ? error.message : 'Recognition failed. No match was accepted.');
      }
    } finally {
      if (originalUri && FileSystem.cacheDirectory && originalUri.startsWith(FileSystem.cacheDirectory)) {
        await FileSystem.deleteAsync(originalUri, { idempotent: true }).catch(() => {});
      }
      if (turn === generation.current) setBusy(false);
    }
  }

  function clearTeachingBelow(level: 'language' | 'set' | 'card') {
    teachingGeneration.current += 1;
    if (level === 'language') {
      setTeachingSetQuery(''); setTeachingSets([]); setTeachingSet(null);
    }
    if (level === 'language' || level === 'set') {
      setTeachingNumber(''); setTeachingCards([]);
    }
    setTeachingCard(null); setTeachingVariants([]); setTeachingCatalogueVersion(null); setTeachingVariantId(null);
  }

  async function chooseTeachingLanguage(language: OwnerTeachingLanguage) {
    if (!access || !result) return;
    clearTeachingBelow('language');
    setTeachingLanguage(language);
    void stackrHaptics.selection();
    const turn = ++teachingGeneration.current;
    const scanTurn = generation.current;
    const ownerId = access.ownerId;
    setTeachingBusy(true);
    try {
      const sets = await listOwnerTeachingSets(language);
      if (turn !== teachingGeneration.current || scanTurn !== generation.current || access.ownerId !== ownerId) return;
      setTeachingSets(sets);
      setMessage('Choose the printed set. Changing it clears the card and finish choices.');
    } catch (error) {
      if (turn === teachingGeneration.current) setMessage(error instanceof Error ? error.message : 'Could not load catalogue sets.');
    } finally { if (turn === teachingGeneration.current) setTeachingBusy(false); }
  }

  async function findTeachingSets() {
    if (!teachingLanguage || !access) return;
    const turn = ++teachingGeneration.current;
    const scanTurn = generation.current;
    const ownerId = access.ownerId;
    setTeachingBusy(true);
    try {
      const sets = await listOwnerTeachingSets(teachingLanguage, teachingSetQuery);
      if (turn !== teachingGeneration.current || scanTurn !== generation.current || access.ownerId !== ownerId) return;
      setTeachingSets(sets);
    } catch (error) {
      if (turn === teachingGeneration.current) setMessage(error instanceof Error ? error.message : 'Could not find catalogue sets.');
    } finally { if (turn === teachingGeneration.current) setTeachingBusy(false); }
  }

  function chooseTeachingSet(set: StackrSet) {
    clearTeachingBelow('set');
    setTeachingSet(set);
    void stackrHaptics.selection();
    setTeachingSetQuery(set.setCode ?? getPreferredSetDisplayName({ id: set.setId, language: set.languageCode,
      localName: set.nativeName, englishDisplayName: set.englishDisplayName }));
  }

  async function findTeachingCards() {
    if (!teachingLanguage || !teachingSet || !access) return;
    const number = teachingNumber.trim();
    if (!number) { setMessage('Enter the printed collector number first.'); return; }
    clearTeachingBelow('card');
    const turn = ++teachingGeneration.current;
    const scanTurn = generation.current;
    const ownerId = access.ownerId;
    setTeachingBusy(true);
    try {
      const cards = await searchOwnerTeachingCards({ language: teachingLanguage, setId: teachingSet.setId, collectorNumber: number });
      if (turn !== teachingGeneration.current || scanTurn !== generation.current || access.ownerId !== ownerId) return;
      setTeachingCards(cards);
      setMessage(cards.length ? 'Choose the canonical card, then its actual finish.' : 'No exact card number was found in that set. Check language, set, and printed number.');
    } catch (error) {
      if (turn === teachingGeneration.current) setMessage(error instanceof Error ? error.message : 'Could not find that card.');
    } finally { if (turn === teachingGeneration.current) setTeachingBusy(false); }
  }

  async function chooseTeachingCard(choice: OwnerTeachingCardChoice) {
    if (!access) return;
    const turn = ++teachingGeneration.current;
    const scanTurn = generation.current;
    const ownerId = access.ownerId;
    setTeachingBusy(true); setTeachingCard(null); setTeachingVariants([]); setTeachingVariantId(null);
    try {
      const loaded = await loadOwnerTeachingCard(choice.cardId);
      if (turn !== teachingGeneration.current || scanTurn !== generation.current || access.ownerId !== ownerId) return;
      setTeachingCard(loaded.card); setTeachingVariants(loaded.variants); setTeachingCatalogueVersion(loaded.catalogueVersion);
      void stackrHaptics.selection();
      setMessage('Choose the card finish exactly as printed. This label will be queued for review.');
    } catch (error) {
      if (turn === teachingGeneration.current) setMessage(error instanceof Error ? error.message : 'Could not load card variants.');
    } finally { if (turn === teachingGeneration.current) setTeachingBusy(false); }
  }

  function correctedTeachingIdentity(): OwnerTeachingIdentity | null {
    if (!teachingCard || !teachingVariantId) return null;
    const variant = teachingVariants.find((candidate) => candidate.variantId === teachingVariantId);
    return variant ? ownerTeachingIdentityFromCard(teachingCard, variant, teachingCatalogueVersion) : null;
  }

  async function saveCapture(localOnly: boolean) {
    if (!access || !result || !imageUri || busy) return;
    const correctedIdentity = correctedTeachingIdentity();
    if (!localOnly && !correctedIdentity) { setMessage('Choose language, set, card number, card, and finish before saving for teaching.'); return; }
    const turn = generation.current;
    let savedCapture: Awaited<ReturnType<typeof saveOwnerCapture>> | null = null;
    setBusy(true);
    try {
      savedCapture = await saveOwnerCapture({
        ownerId: access.ownerId, imageUri, physicalCardId, result, selectedVariantId: selected,
        correctedIdentity, trainingUseApproved: false,
      });
      if (turn !== generation.current) return;
      if (!localOnly) {
        setMessage('Backing up your cropped photo and correction to your private review queue…');
        await uploadOwnerCapture(access.ownerId, savedCapture.id);
        if (turn !== generation.current) return;
      }
      const saved = await listOwnerCaptures(access.ownerId);
      if (turn !== generation.current) return;
      setCaptures(saved);
      setMessage(localOnly
        ? correctedIdentity ? 'Saved with its corrected label on this device. Nothing was sent for training or review.' : 'Saved privately on this device. Nothing was sent for training or review.'
        : 'Saved and backed up to your private review queue. It is not used for training until reviewed.');
      void stackrHaptics.captureSaved();
      setResult(null); setImageUri(null); await releasePhoto();
    } catch (error) {
      if (turn !== generation.current) return;
      if (savedCapture) {
        // The device record is already complete. Clear the active crop so a
        // second press cannot create another example; surface the saved row's
        // retry action instead.
        const saved = await listOwnerCaptures(access.ownerId).catch(() => null);
        if (turn !== generation.current) return;
        if (saved) setCaptures(saved);
        setResult(null); setImageUri(null); await releasePhoto();
        setMessage('Saved on this device, but private review upload failed. Use Retry private review upload below; this example is not used for training.');
      } else {
        setMessage(error instanceof Error ? error.message : 'Capture could not be saved.');
      }
    }
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
        {button(`${selected === candidate.variantId ? '✓ ' : ''}${getPreferredCardDisplayName({ language: candidate.language, localName: candidate.nativeName, englishDisplayName: candidate.name, collectorNumber: candidate.collectorNumber })} · ${candidate.collectorNumber} · ${candidate.language}\n${candidate.setCode || candidate.setId} · ${candidate.variantCode || 'variant unspecified'} · similarity ${candidate.similarity.toFixed(3)}`,
          () => { setSelected(candidate.variantId); void stackrHaptics.selection(); }, busy)}
      </View>)}
      {result && <View style={{ marginTop: 18 }}>
        {button('None is correct / save as unresolved', () => { setSelected(null); void stackrHaptics.selection(); }, busy)}
        {button(teachingOpen ? 'Close teaching correction' : 'Teach / correct this card', () => {
          teachingGeneration.current += 1;
          setTeachingOpen((open) => !open);
          if (!teachingOpen) {
            const candidate = result.candidates.find((item) => item.variantId === selected);
            const language = candidate?.language as OwnerTeachingLanguage | undefined;
            if (language && OWNER_TEACHING_LANGUAGES.some((item) => item.code === language)) {
              void chooseTeachingLanguage(language);
            } else {
              setMessage('Choose language, then set, printed card number, and actual finish.');
            }
          }
        }, busy)}
        {teachingOpen && <View style={{ marginTop: 16, padding: 14, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Corrected catalogue label</Text>
          <Text style={{ color: theme.colors.textSoft, marginTop: 6 }}>This can be a card outside the five model suggestions. Each earlier choice clears dependent choices to prevent a mixed identity.</Text>
          <Text style={{ color: theme.colors.text, fontWeight: '800', marginTop: 14 }}>1. Printed language</Text>
          {OWNER_TEACHING_LANGUAGES.map((language) => button(`${teachingLanguage === language.code ? '✓ ' : ''}${language.label}`,
            () => void chooseTeachingLanguage(language.code), busy || teachingBusy))}
          {teachingLanguage && <>
            <Text style={{ color: theme.colors.text, fontWeight: '800', marginTop: 14 }}>2. Printed set</Text>
            <TextInput value={teachingSetQuery} onChangeText={(value) => { setTeachingSetQuery(value); setTeachingSet(null); clearTeachingBelow('set'); }}
              maxLength={100} placeholder="Set name or code" placeholderTextColor={theme.colors.textSoft}
              style={{ color: theme.colors.text, borderColor: theme.colors.border, borderWidth: 1, padding: 14, borderRadius: 12, marginTop: 10 }} />
            {button('Find set', () => void findTeachingSets(), busy || teachingBusy)}
            {teachingSets.slice(0, 12).map((set) => <View key={set.setId}>{button(`${teachingSet?.setId === set.setId ? '✓ ' : ''}${set.setCode ?? set.setId} · ${getPreferredSetDisplayName({ id: set.setId, setCode: set.setCode, language: set.languageCode, localName: set.nativeName, englishDisplayName: set.englishDisplayName })}`,
              () => chooseTeachingSet(set), busy || teachingBusy)}</View>)}
          </>}
          {teachingSet && <>
            <Text style={{ color: theme.colors.text, fontWeight: '800', marginTop: 14 }}>3. Printed collector number</Text>
            <TextInput value={teachingNumber} onChangeText={(value) => { setTeachingNumber(value); clearTeachingBelow('card'); }}
              maxLength={40} placeholder="e.g. 157 or TG12" placeholderTextColor={theme.colors.textSoft}
              style={{ color: theme.colors.text, borderColor: theme.colors.border, borderWidth: 1, padding: 14, borderRadius: 12, marginTop: 10 }} />
            {button('Find exact card', () => void findTeachingCards(), busy || teachingBusy)}
            {teachingCards.map((card) => <View key={card.cardId}>{button(`${card.name} · ${card.collectorNumber} · ${card.setCode}`,
              () => void chooseTeachingCard(card), busy || teachingBusy)}</View>)}
          </>}
          {teachingCard && <>
            <Text style={{ color: theme.colors.text, fontWeight: '800', marginTop: 14 }}>4. Actual finish</Text>
            {teachingVariants.map((variant) => <View key={variant.variantId}>{button(`${teachingVariantId === variant.variantId ? '✓ ' : ''}${ownerTeachingVariantLabel(variant)}`,
              () => { setTeachingVariantId(variant.variantId); void stackrHaptics.selection(); }, busy || teachingBusy)}</View>)}
          </>}
        </View>}
        <Text style={{ color: theme.colors.textSoft, marginTop: 16 }}>Use the same physical-card label for every photo of that card. Save on device keeps it only here. Save for teaching uploads this cropped photo and your correction to your private dataset for review; it does not retrain the model automatically.</Text>
        <TextInput value={physicalCardId} onChangeText={setPhysicalCardId} maxLength={120}
          placeholder="Physical-card label, e.g. my-pikachu-001" placeholderTextColor={theme.colors.textSoft}
          style={{ color: theme.colors.text, borderColor: theme.colors.border, borderWidth: 1, padding: 14, borderRadius: 12, marginTop: 12 }} />
        {button(selected ? 'Save confirmed capture on device' : 'Save unresolved capture on device', () => void saveCapture(true), busy || !physicalCardId.trim())}
        {button('Save for teaching and upload for review', () => void saveCapture(false), busy || !physicalCardId.trim() || !correctedTeachingIdentity())}
      </View>}
      {user?.id && OWNER_PRIVATE_RECOGNITION_ENABLED && <View style={{ marginTop: 24 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '800' }}>My device dataset · {captures.length} captures</Text>
        <Text style={{ color: theme.colors.textSoft, marginVertical: 8 }}>Saved only on this device under your account. Deleting the app may remove it. These captures are not automatically used for model training.</Text>
        {captures.map((capture) => <View key={capture.id}>
          <Text style={{ color: theme.colors.text, marginTop: 12 }}>{capture.physicalCardId} · {capture.reviewStatus}{capture.uploadStatus ? ` · ${capture.uploadStatus}` : ' · local'}</Text>
          {capture.correctedIdentity && capture.uploadStatus !== 'uploaded' && button('Retry private review upload', () => {
            const turn = generation.current;
            void uploadOwnerCapture(user.id, capture.id).then(() => listOwnerCaptures(user.id))
              .then((next) => { if (turn === generation.current) { setCaptures(next); setMessage('Private review upload complete.'); } })
              .catch((error) => { if (turn === generation.current) setMessage(error instanceof Error ? error.message : 'Could not upload this capture. Try again.'); });
          }, busy)}
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
