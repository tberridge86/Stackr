import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Text } from './Text';
import { StackrImage } from './StackrImage';
import { useTheme } from './theme-context';
import { stackrCardImageSizes } from '../lib/stackrSizing';
import { RARITY_SYMBOL_CARD_OVERLAY, RaritySymbol } from './RaritySymbol';

type StackrCardTileProps = {
  imageUri?: string | null;
  name: string;
  setName?: string | null;
  number?: string | null;
  rarity?: string | null;
  selected?: boolean;
  collected?: boolean;
  quantity?: number | null;
  hint?: string | null;
  mode?: 'row' | 'grid';
  footer?: React.ReactNode;
  rightAccessory?: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
};

function StackrCardTileBase({
  imageUri,
  name,
  setName,
  number,
  rarity,
  selected = false,
  collected = false,
  quantity,
  hint,
  mode = 'row',
  footer,
  rightAccessory,
  disabled = false,
  style,
  onPress,
  onLongPress,
  accessibilityLabel,
}: StackrCardTileProps) {
  const { theme } = useTheme();
  const active = selected || collected;
  const compact = mode === 'grid';
  const imageWidth = compact ? '100%' : stackrCardImageSizes.rowCard.width;
  const imageHeight = compact ? undefined : stackrCardImageSizes.rowCard.height;
  const meta = [setName, number ? `#${number}` : null].filter(Boolean).join(' | ');
  const cardAccessibilityLabel = accessibilityLabel ?? [
    name,
    rarity ? `${rarity} rarity` : null,
    hint ?? 'Tap to select. Hold for details.',
  ].filter(Boolean).join('. ');

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      disabled={disabled}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={cardAccessibilityLabel}
      style={[
        compact ? styles.gridTile : styles.rowTile,
        {
          backgroundColor: active ? theme.colors.primary + '14' : theme.colors.card,
          borderColor: active ? theme.colors.primary + '82' : theme.colors.border,
          opacity: disabled ? 0.58 : 1,
        },
        style,
      ]}
    >
      <View style={[compact ? styles.gridImageFrame : styles.rowImageFrame, { backgroundColor: theme.colors.surface }]}>
        {imageUri ? (
          <StackrImage
            uri={imageUri}
            style={{
              width: imageWidth,
              height: imageHeight,
              aspectRatio: compact ? stackrCardImageSizes.cardAspectRatio : undefined,
            }}
            contentFit="contain"
            priority="low"
            showFallbackIcon={false}
          />
        ) : (
          <Ionicons name="image-outline" size={compact ? 26 : 20} color={theme.colors.textSoft} />
        )}
        {active ? (
          <View style={[styles.checkBadge, { backgroundColor: theme.colors.primary }]}>
            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
          </View>
        ) : null}
        {quantity && quantity > 1 ? (
          <View style={[styles.quantityBadge, { backgroundColor: theme.colors.primary }]}>
            <Text numeric style={styles.quantityText}>x{quantity}</Text>
          </View>
        ) : null}
        <RaritySymbol
          rarity={rarity}
          size={compact ? 16 : 14}
          style={RARITY_SYMBOL_CARD_OVERLAY}
        />
      </View>

      <View style={compact ? styles.gridCopy : styles.rowCopy}>
        <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={compact ? 2 : 1}>
          {name}
        </Text>
        {meta ? (
          <Text style={[styles.meta, { color: theme.colors.textSoft }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {hint ? (
          <Text style={[styles.hint, { color: theme.colors.textSoft }]} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
        {footer ? (
          <View style={styles.footer}>{footer}</View>
        ) : null}
      </View>
      {rightAccessory ? (
        <View style={styles.rightAccessory}>{rightAccessory}</View>
      ) : null}
    </TouchableOpacity>
  );
}

export const StackrCardTile = React.memo(StackrCardTileBase);

const tileShadow = {
  shadowColor: '#6136F5',
  shadowOpacity: 0.10,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

const styles = StyleSheet.create({
  rowTile: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    ...tileShadow,
  },
  gridTile: {
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    ...tileShadow,
  },
  rowImageFrame: {
    width: stackrCardImageSizes.rowCard.width,
    height: stackrCardImageSizes.rowCard.height,
    borderRadius: stackrCardImageSizes.rowCard.radius,
    marginRight: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridImageFrame: {
    width: '100%',
    aspectRatio: stackrCardImageSizes.cardAspectRatio,
    borderRadius: stackrCardImageSizes.gridCardRadius,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  gridCopy: {
    minHeight: 58,
  },
  name: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    paddingBottom: 1,
    includeFontPadding: true,
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    includeFontPadding: true,
  },
  hint: {
    marginTop: 5,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    includeFontPadding: true,
  },
  footer: {
    marginTop: 6,
  },
  rightAccessory: {
    marginLeft: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    right: 5,
    top: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  quantityBadge: {
    position: 'absolute',
    left: 5,
    top: 5,
    minWidth: 28,
    height: 23,
    borderRadius: 12,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  quantityText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
});
