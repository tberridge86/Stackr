import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { StackrBottomSheet } from './StackrModalSystem';
import { StackrNavigationIcon } from './StackrNavigationIcon';
import { Text } from './Text';
import { useTheme } from './theme-context';

export type BrowseChoice = { key: string; label: string; count?: number };

/** A binder action uses the same existing glyph as the Collection tab. */
export function StackrBinderButton({
  onPress,
  label = 'Create binder',
  disabled = false,
  style,
}: {
  onPress: () => void;
  label?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.binderAction, { borderColor: theme.colors.border, backgroundColor: theme.colors.card, opacity: disabled ? 0.5 : 1 }, style]}
    >
      <StackrNavigationIcon name="collection" color={theme.colors.primary} size={22} />
      <Text style={[styles.actionLabel, { color: theme.colors.primary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Keep only search, ownership and one filter entry point above a browse list. */
export function StackrBrowseToolbar({
  search,
  onSearchChange,
  onSubmitSearch,
  loading = false,
  placeholder = 'Search cards…',
  onOpenFilters,
  activeFilterCount = 0,
  choices = [],
  selected,
  onSelect,
  resultLabel,
  horizontalInset = 16,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  onSubmitSearch?: () => void;
  loading?: boolean;
  placeholder?: string;
  onOpenFilters: () => void;
  activeFilterCount?: number;
  choices?: BrowseChoice[];
  selected?: string;
  onSelect?: (key: string) => void;
  resultLabel?: string;
  horizontalInset?: number;
}) {
  const { theme } = useTheme();
  const filterLabel = activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : 'Filters';
  return (
    <View testID="browse-toolbar" accessibilityState={{ busy: loading }} style={[styles.toolbar, { backgroundColor: theme.colors.bg, paddingHorizontal: horizontalInset }]}>
      <View style={styles.searchRow}>
        <View style={[styles.searchField, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Ionicons name="search-outline" size={19} color={theme.colors.textSoft} />
          <TextInput
            accessibilityLabel={placeholder}
            value={search}
            onChangeText={onSearchChange}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.textSoft}
            autoCorrect={false}
            spellCheck={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => { Keyboard.dismiss(); onSubmitSearch?.(); }}
            style={[styles.searchInput, { color: theme.colors.text }]}
          />
          {loading ? <ActivityIndicator size="small" color={theme.colors.primary} accessibilityLabel="Searching" /> : null}
          {search.length > 0 ? (
            <TouchableOpacity
              onPress={() => onSearchChange('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              style={styles.clearSearch}
            >
              <Ionicons name="close-circle" size={20} color={theme.colors.textSoft} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => { Keyboard.dismiss(); onOpenFilters(); }}
          accessibilityRole="button"
          accessibilityLabel={`${filterLabel}. Filter and sort results`}
          style={[styles.filterButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
        >
          <Ionicons name="options-outline" size={20} color={theme.colors.primary} />
          <Text style={[styles.actionLabel, { color: theme.colors.primary }]}>{filterLabel}</Text>
        </TouchableOpacity>
      </View>
      {choices.length > 0 || resultLabel ? (
        <View style={styles.ownershipRow}>
          {choices.map((choice) => (
            <TouchableOpacity
              key={choice.key}
              accessibilityRole="button"
              accessibilityLabel={choice.label}
              accessibilityState={{ selected: selected === choice.key, disabled: !onSelect }}
              disabled={!onSelect}
              onPress={() => onSelect?.(choice.key)}
              style={[styles.ownershipChoice, { backgroundColor: selected === choice.key ? theme.colors.primary : 'transparent' }]}
            >
              <Text style={[styles.actionLabel, { color: selected === choice.key ? '#FFFFFF' : theme.colors.text }]}>{choice.label}</Text>
            </TouchableOpacity>
          ))}
          {resultLabel ? <Text style={[styles.resultLabel, { color: theme.colors.textSoft }]}>{resultLabel}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/** Wrapping options stay reachable at larger text sizes; none are clipped offscreen. */
export function StackrBrowseFilterGroup({ title, choices, selected, onSelect }: {
  title: string;
  choices: BrowseChoice[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.filterGroup}>
      <Text accessibilityRole="header" style={[styles.groupTitle, { color: theme.colors.text }]}>{title}</Text>
      <View style={styles.filterChoices}>
        {choices.map((choice) => (
          <TouchableOpacity
            key={choice.key}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === choice.key }}
            accessibilityLabel={choice.count === undefined ? choice.label : `${choice.label}, ${choice.count} entries`}
            onPress={() => onSelect(choice.key)}
            style={[styles.filterChoice, { borderColor: selected === choice.key ? theme.colors.primary : theme.colors.border, backgroundColor: selected === choice.key ? theme.colors.surface : theme.colors.card }]}
          >
            <Text style={[styles.actionLabel, { color: selected === choice.key ? theme.colors.primary : theme.colors.text }]}>
              {choice.label}{choice.count === undefined ? '' : ` · ${choice.count}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export function StackrBrowseFilterSheet({ visible, onClose, onClear, children }: {
  visible: boolean;
  onClose: () => void;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <StackrBottomSheet
      visible={visible}
      title="Filter and sort"
      onClose={onClose}
      onClear={onClear}
      maxHeight="86%"
      contentContainerStyle={styles.sheetContent}
      footer={
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Show results" onPress={onClose} style={[styles.doneButton, { backgroundColor: theme.colors.primary }]}>
          <Text style={[styles.actionLabel, { color: '#FFFFFF' }]}>Show results</Text>
        </TouchableOpacity>
      }
    >
      {children}
    </StackrBottomSheet>
  );
}

/** Use as the list header, never as another permanently pinned panel. */
export function StackrBrowseSummary({ title, subtitle, logo, children, action }: {
  title: string;
  subtitle?: string;
  logo?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View testID="browse-summary" style={[styles.summary, { borderColor: theme.colors.border }]}>
      <View style={styles.summaryIdentity}>
        {logo}
        <View style={styles.summaryCopy}>
          <Text accessibilityRole="header" style={[styles.summaryTitle, { color: theme.colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.summarySubtitle, { color: theme.colors.textSoft }]}>{subtitle}</Text> : null}
        </View>
      </View>
      {children || action ? <View style={styles.summaryDetails}><View style={styles.summaryCopy}>{children}</View>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4, gap: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchField: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, gap: 6 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 15, paddingVertical: 8, paddingRight: 6 },
  clearSearch: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  filterButton: { minWidth: 44, minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, gap: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  ownershipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  ownershipChoice: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  resultLabel: { marginLeft: 'auto', fontSize: 12, paddingVertical: 4, flexShrink: 1 },
  filterGroup: { marginBottom: 20, gap: 8 },
  groupTitle: { fontSize: 16, fontWeight: '700' },
  filterChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChoice: { minHeight: 44, minWidth: 44, maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 12, justifyContent: 'center' },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 12 },
  doneButton: { minHeight: 48, padding: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  binderAction: { minHeight: 44, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderRadius: 12 },
  summary: { paddingVertical: 10, marginBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  summaryIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryTitle: { fontSize: 20, fontWeight: '800' },
  summarySubtitle: { fontSize: 13, marginTop: 2 },
  summaryDetails: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
});
