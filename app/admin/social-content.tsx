import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/Text';
import { StackrBackButton } from '../../components/StackrBackButton';
import { useTheme } from '../../components/theme-context';
import { useProfile } from '../../components/profile-context';
import { supabase } from '../../lib/supabase';

type ContentType = 'shop' | 'event' | 'meetup' | 'news';

const CONTENT_TABS: { key: ContentType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'shop', label: 'Shop', icon: 'storefront-outline' },
  { key: 'event', label: 'Event', icon: 'calendar-outline' },
  { key: 'meetup', label: 'Meetup', icon: 'people-outline' },
  { key: 'news', label: 'News', icon: 'newspaper-outline' },
];

const NEWS_ICONS = [
  'newspaper-outline',
  'sparkles-outline',
  'megaphone-outline',
  'calendar-outline',
];

function emptyForm() {
  return {
    title: '',
    name: '',
    body: '',
    description: '',
    venue: '',
    town: '',
    postcode: '',
    website: '',
    url: '',
    startsAt: '',
    category: 'Latest Stackr news',
    icon: 'newspaper-outline',
  };
}

function parseOptionalDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Use a readable date, for example 31 May 2026 18:30.');
  }

  return parsed.toISOString();
}

export default function AdminSocialContentScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { profile } = useProfile();
  const [activeType, setActiveType] = useState<ContentType>('shop');
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const updateField = (key: keyof ReturnType<typeof emptyForm>, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const reset = () => setForm(emptyForm());

  const save = async () => {
    if (!isAdmin) {
      Alert.alert('Admin only', 'Your profile needs the admin role to publish social content.');
      return;
    }

    try {
      setSaving(true);

      if (activeType === 'shop') {
        if (!form.name.trim()) throw new Error('Add a shop name.');

        const { error } = await supabase.from('local_stores').insert({
          name: form.name.trim(),
          description: form.description.trim() || null,
          town: form.town.trim() || null,
          postcode: form.postcode.trim() || null,
          website_url: form.website.trim() || null,
          is_published: true,
        });

        if (error) throw error;
      }

      if (activeType === 'event') {
        if (!form.title.trim()) throw new Error('Add an event title.');

        const { error } = await supabase.from('local_featured_events').insert({
          title: form.title.trim(),
          description: form.description.trim() || null,
          venue_name: form.venue.trim() || null,
          town: form.town.trim() || null,
          postcode: form.postcode.trim() || null,
          starts_at: parseOptionalDate(form.startsAt),
          external_url: form.url.trim() || null,
          is_published: true,
        });

        if (error) throw error;
      }

      if (activeType === 'meetup') {
        if (!form.title.trim()) throw new Error('Add a meetup title.');
        if (!form.venue.trim()) throw new Error('Add a meetup location.');

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) throw new Error('You must be signed in.');

        const { error } = await supabase.from('local_meetups').insert({
          title: form.title.trim(),
          description: form.description.trim() || null,
          location_name: form.venue.trim(),
          town: form.town.trim() || null,
          postcode: form.postcode.trim() || null,
          starts_at: parseOptionalDate(form.startsAt),
          status: 'published',
          created_by: user.id,
        });

        if (error) throw error;
      }

      if (activeType === 'news') {
        if (!form.title.trim()) throw new Error('Add a news title.');
        if (!form.body.trim()) throw new Error('Add news body text.');

        const { error } = await supabase.from('community_news').insert({
          title: form.title.trim(),
          body: form.body.trim(),
          category: form.category.trim() || 'Latest',
          icon: form.icon.trim() || 'newspaper-outline',
          external_url: form.url.trim() || null,
          is_published: true,
          published_at: new Date().toISOString(),
        });

        if (error) throw error;
      }

      reset();
      Alert.alert('Published', 'Social content has been added.');
    } catch (error: any) {
      Alert.alert('Could not publish', error?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const title = activeType === 'shop'
    ? 'Add Local Shop'
    : activeType === 'event'
      ? 'Add Event'
      : activeType === 'meetup'
        ? 'Add Meetup'
        : 'Add News';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <StackrBackButton onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>Social Content</Text>
          <Text style={styles.subheading}>Admin publishing for shops, events, meetups and news.</Text>
        </View>
      </View>

      {!isAdmin ? (
        <View style={styles.lockedPanel}>
          <Ionicons name="lock-closed-outline" size={28} color={theme.colors.primary} />
          <Text style={styles.panelTitle}>Admin only</Text>
          <Text style={styles.helpText}>Your profile role must be admin to use this screen.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.tabRow}>
            {CONTENT_TABS.map((tab) => {
              const active = activeType === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => {
                    setActiveType(tab.key);
                    reset();
                  }}
                  style={[styles.tab, active && styles.tabActive]}
                >
                  <Ionicons name={tab.icon} size={17} color={active ? theme.colors.primary : theme.colors.textSoft} />
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.formPanel}>
            <Text style={styles.panelTitle}>{title}</Text>

            {activeType === 'shop' && (
              <>
                <Field label="Shop name" value={form.name} onChangeText={(text) => updateField('name', text)} styles={styles} />
                <Field label="Description" value={form.description} onChangeText={(text) => updateField('description', text)} multiline styles={styles} />
                <Field label="Town" value={form.town} onChangeText={(text) => updateField('town', text)} styles={styles} />
                <Field label="Postcode" value={form.postcode} onChangeText={(text) => updateField('postcode', text)} styles={styles} />
                <Field label="Website" value={form.website} onChangeText={(text) => updateField('website', text)} styles={styles} />
              </>
            )}

            {activeType === 'event' && (
              <>
                <Field label="Event title" value={form.title} onChangeText={(text) => updateField('title', text)} styles={styles} />
                <Field label="Description" value={form.description} onChangeText={(text) => updateField('description', text)} multiline styles={styles} />
                <Field label="Venue" value={form.venue} onChangeText={(text) => updateField('venue', text)} styles={styles} />
                <Field label="Town" value={form.town} onChangeText={(text) => updateField('town', text)} styles={styles} />
                <Field label="Postcode" value={form.postcode} onChangeText={(text) => updateField('postcode', text)} styles={styles} />
                <Field label="Starts at" placeholder="31 May 2026 18:30" value={form.startsAt} onChangeText={(text) => updateField('startsAt', text)} styles={styles} />
                <Field label="Link" value={form.url} onChangeText={(text) => updateField('url', text)} styles={styles} />
              </>
            )}

            {activeType === 'meetup' && (
              <>
                <Field label="Meetup title" value={form.title} onChangeText={(text) => updateField('title', text)} styles={styles} />
                <Field label="Description" value={form.description} onChangeText={(text) => updateField('description', text)} multiline styles={styles} />
                <Field label="Location" value={form.venue} onChangeText={(text) => updateField('venue', text)} styles={styles} />
                <Field label="Town" value={form.town} onChangeText={(text) => updateField('town', text)} styles={styles} />
                <Field label="Postcode" value={form.postcode} onChangeText={(text) => updateField('postcode', text)} styles={styles} />
                <Field label="Starts at" placeholder="31 May 2026 18:30" value={form.startsAt} onChangeText={(text) => updateField('startsAt', text)} styles={styles} />
              </>
            )}

            {activeType === 'news' && (
              <>
                <Field label="Title" value={form.title} onChangeText={(text) => updateField('title', text)} styles={styles} />
                <Field label="Body" value={form.body} onChangeText={(text) => updateField('body', text)} multiline styles={styles} />
                <Text style={styles.label}>Category</Text>
                <View style={styles.iconChoiceRow}>
                  {['Latest Stackr news', 'Pokemon News', 'New card set news'].map((category) => {
                    const selected = form.category === category;
                    return (
                      <Pressable
                        key={category}
                        onPress={() => updateField('category', category)}
                        style={[styles.categoryChoice, selected && styles.categoryChoiceActive]}
                      >
                        <Text style={[styles.categoryChoiceText, selected && styles.categoryChoiceTextActive]}>{category}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.label}>Icon</Text>
                <View style={styles.iconChoiceRow}>
                  {NEWS_ICONS.map((icon) => {
                    const selected = form.icon === icon;
                    return (
                      <Pressable
                        key={icon}
                        onPress={() => updateField('icon', icon)}
                        style={[styles.iconChoice, selected && styles.iconChoiceActive]}
                      >
                        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color={selected ? theme.colors.primary : theme.colors.textSoft} />
                      </Pressable>
                    );
                  })}
                </View>
                <Field label="Link" value={form.url} onChangeText={(text) => updateField('url', text)} styles={styles} />
              </>
            )}

            <Pressable onPress={save} disabled={saving} style={[styles.saveButton, saving && { opacity: 0.65 }]}>
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.saveButtonText}>Publish</Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  styles,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        multiline={multiline}
        style={[styles.input, multiline && styles.textArea]}
      />
    </View>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    iconButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    heading: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: '900',
    },
    subheading: {
      color: theme.colors.textSoft,
      fontSize: 13,
      fontWeight: '700',
      marginTop: 2,
    },
    content: {
      paddingHorizontal: 18,
      paddingBottom: 40,
    },
    tabRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 14,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    tabActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary + '14',
    },
    tabText: {
      color: theme.colors.textSoft,
      fontSize: 13,
      fontWeight: '900',
    },
    tabTextActive: {
      color: theme.colors.primary,
    },
    formPanel: {
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
    },
    lockedPanel: {
      margin: 18,
      padding: 18,
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    panelTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '900',
      marginBottom: 12,
    },
    helpText: {
      color: theme.colors.textSoft,
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
    },
    label: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '900',
      marginBottom: 6,
    },
    input: {
      minHeight: 46,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      paddingHorizontal: 12,
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    textArea: {
      minHeight: 104,
      paddingTop: 10,
      textAlignVertical: 'top',
    },
    iconChoiceRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    iconChoice: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    iconChoiceActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary + '14',
    },
    categoryChoice: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    categoryChoiceActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary + '14',
    },
    categoryChoiceText: {
      color: theme.colors.textSoft,
      fontSize: 11,
      fontWeight: '900',
    },
    categoryChoiceTextActive: {
      color: theme.colors.primary,
    },
    saveButton: {
      minHeight: 50,
      borderRadius: 14,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginTop: 4,
    },
    saveButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
    },
  });
}
