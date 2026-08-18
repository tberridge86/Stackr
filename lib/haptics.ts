import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * StackR's tactile vocabulary.
 *
 * Haptics should confirm meaningful state changes, not every tap. Keeping the
 * vocabulary here prevents individual screens from inventing stronger or more
 * frequent feedback and makes the scanner feel consistent with binders/seller.
 */
export type StackrHapticEvent =
  | 'selection'
  | 'scanner_frame_ready'
  | 'scanner_capture_locked'
  | 'scanner_exact_match'
  | 'scanner_ambiguous'
  | 'scanner_failed'
  | 'card_added'
  | 'duplicate_prevented'
  | 'binder_milestone'
  | 'listing_completed'
  | 'sale_completed'
  | 'trade_completed'
  | 'action_failed';

const cooldowns: Partial<Record<StackrHapticEvent, number>> = {
  selection: 80,
  scanner_frame_ready: 650,
  scanner_capture_locked: 450,
  scanner_exact_match: 650,
  scanner_ambiguous: 1200,
  scanner_failed: 1500,
  duplicate_prevented: 1000,
};

const lastPlayedAt = new Map<StackrHapticEvent, number>();
let enabled = true;

export function setStackrHapticsEnabled(next: boolean) {
  enabled = next;
}

export function getStackrHapticsEnabled() {
  return enabled;
}

function shouldPlay(event: StackrHapticEvent) {
  if (!enabled || Platform.OS === 'web') return false;
  const now = Date.now();
  const cooldown = cooldowns[event] ?? 0;
  const last = lastPlayedAt.get(event) ?? 0;
  if (now - last < cooldown) return false;
  lastPlayedAt.set(event, now);
  return true;
}

async function safe(effect: () => Promise<void>) {
  try {
    await effect();
  } catch {
    // Tactile feedback must never block or fail the product action itself.
  }
}

async function doubleImpact(
  first: Haptics.ImpactFeedbackStyle,
  second: Haptics.ImpactFeedbackStyle,
  delayMs = 65,
) {
  await Haptics.impactAsync(first);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  await Haptics.impactAsync(second);
}

export async function haptic(event: StackrHapticEvent) {
  if (!shouldPlay(event)) return;

  await safe(async () => {
    switch (event) {
      case 'selection':
        await Haptics.selectionAsync();
        return;
      case 'scanner_frame_ready':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
        return;
      case 'scanner_capture_locked':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      case 'scanner_exact_match':
        // StackR's recognition signature: lock, then a firmer confirmation.
        await doubleImpact(Haptics.ImpactFeedbackStyle.Light, Haptics.ImpactFeedbackStyle.Medium, 55);
        return;
      case 'scanner_ambiguous':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      case 'scanner_failed':
      case 'action_failed':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      case 'card_added':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      case 'duplicate_prevented':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
        return;
      case 'binder_milestone':
      case 'listing_completed':
      case 'sale_completed':
      case 'trade_completed':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
    }
  });
}

export const stackrHaptics = {
  selection: () => haptic('selection'),
  scannerFrameReady: () => haptic('scanner_frame_ready'),
  scannerCaptureLocked: () => haptic('scanner_capture_locked'),
  scannerExactMatch: () => haptic('scanner_exact_match'),
  scannerAmbiguous: () => haptic('scanner_ambiguous'),
  scannerFailed: () => haptic('scanner_failed'),
  cardAdded: () => haptic('card_added'),
  duplicatePrevented: () => haptic('duplicate_prevented'),
  binderMilestone: () => haptic('binder_milestone'),
  listingCompleted: () => haptic('listing_completed'),
  saleCompleted: () => haptic('sale_completed'),
  tradeCompleted: () => haptic('trade_completed'),
  actionFailed: () => haptic('action_failed'),
};
