import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { createScannedVariantSaver, ScannedVariantConflictError } from './scanVariantOwnershipCore';

const storageKey = (key: string) => 'stackr:scan-variant-ownership:v1:' + key;

export const addScannedVariantCopy = createScannedVariantSaver({
  readJournal: key => AsyncStorage.getItem(storageKey(key)),
  writeJournal: (key, value) => AsyncStorage.setItem(storageKey(key), value),
  verifyUser: async userId => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (data.user?.id !== userId) throw new Error('Your account changed. Reopen the scan before trying again.');
  },
  readQuantity: async identity => {
    const { data, error } = await supabase.from('user_card_variants').select('quantity')
      .eq('user_id', identity.userId).eq('card_id', identity.cardId).eq('set_id', identity.setId).eq('variant', identity.variant)
      .eq('condition', identity.condition).eq('grade_company', identity.gradeCompany).eq('grade', identity.grade).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    if (data.quantity === null) throw new Error('The saved variant quantity could not be verified.');
    return data.quantity;
  },
  writeExpected: async journal => {
    const result = journal.baselineQuantity !== null
      ? await supabase.from('user_card_variants').update({ quantity: journal.expectedQuantity })
        .eq('user_id', journal.userId).eq('card_id', journal.cardId).eq('set_id', journal.setId).eq('variant', journal.variant)
        .eq('condition', journal.condition).eq('grade_company', journal.gradeCompany).eq('grade', journal.grade)
        .eq('quantity', journal.baselineQuantity).select('quantity').maybeSingle()
      : await supabase.from('user_card_variants').insert({
        user_id: journal.userId, card_id: journal.cardId, set_id: journal.setId, variant: journal.variant,
        condition: journal.condition, grade_company: journal.gradeCompany, grade: journal.grade, quantity: journal.expectedQuantity,
      }).select('quantity').single();
    if (result.error) {
      if (result.error.code === '23505') throw new ScannedVariantConflictError('This variant changed during the save. Check the collection before trying again.');
      throw result.error;
    }
    if (!result.data || result.data.quantity !== journal.expectedQuantity) {
      throw new ScannedVariantConflictError('Variant quantity changed before this copy could be added.');
    }
  },
});
