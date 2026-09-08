import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { beginProfileLoad, finishProfileLoad, type ProfileLoadState } from '../lib/profileLoadState';
import { useAuth } from './auth-context';

export type Profile = {
  id: string;
  email: string | null;
  collector_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
  banner_url: string | null;
  pokemon_type: string | null;
  background_key: string | null;
  profile_banner_cosmetic_id?: string | null;
  profile_border_cosmetic_id?: string | null;

  favorite_card_id: string | null;
  favorite_set_id: string | null;
  chase_card_id: string | null;
  chase_set_id: string | null;

  role?: string | null;
  created_at?: string;
};

type ProfileContextType = {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: any }>;
  setFavoriteCard: (cardId: string, setId: string) => Promise<void>;
  setChaseCard: (cardId: string, setId: string) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  loading: true,
  error: null,
  refreshProfile: async () => {},
  updateProfile: async () => ({ error: null }),
  setFavoriteCard: async () => {},
  setChaseCard: async () => {},
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const accountId: string | null = user?.id ?? null;
  const currentAccountId = useRef(accountId);
  currentAccountId.current = accountId;
  const requestSequence = useRef(0);
  const [state, setState] = useState<ProfileLoadState<Profile>>({
    accountId: null, requestId: 0, profile: null, loading: true, error: null,
  });
  const belongsToAccount = state.accountId === accountId;
  const profile = belongsToAccount && !authLoading ? state.profile : null;
  const loading = authLoading || !belongsToAccount || state.loading;
  const error = belongsToAccount && !authLoading ? state.error : null;

  const refreshProfile = useCallback(async () => {
    if (currentAccountId.current !== accountId) return;
    const requestId = ++requestSequence.current;
    setState((previous) => beginProfileLoad(previous, accountId, requestId));
    if (!accountId) return;
    try {
      const { data, error: loadError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', accountId)
        .maybeSingle();
      setState((previous) => finishProfileLoad(previous, { accountId, requestId, data: data as Profile | null, error: loadError }));
    } catch (loadError) {
      setState((previous) => finishProfileLoad(previous, { accountId, requestId, data: null, error: loadError }));
    }
  }, [accountId]);

  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!user) return { error: 'No user' };
    if (currentAccountId.current !== user.id) return { error: new Error('Your account changed. Please reopen your profile before saving.') };
    if (loading || error) return { error: new Error('Load your profile successfully before making changes.') };

    const {
      id: _ignoredId,
      email: _ignoredEmail,
      role: _ignoredRole,
      created_at: _ignoredCreatedAt,
      ...publicUpdates
    } = updates;

    const { error: updateError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          ...publicUpdates,
        },
        { onConflict: 'id' }
      );

    if (currentAccountId.current !== user.id) return { error: new Error('Your account changed. Please reopen your profile before saving.') };
    if (!updateError) {
      await refreshProfile();
    }

    return { error: updateError };
  }, [error, loading, refreshProfile, user]);

  const setFavoriteCard = useCallback(async (cardId: string, setId: string) => {
    if (!user) return;

    await updateProfile({
      favorite_card_id: cardId,
      favorite_set_id: setId,
    });
  }, [updateProfile, user]);

  const setChaseCard = useCallback(async (cardId: string, setId: string) => {
    if (!user) return;

    await updateProfile({
      chase_card_id: cardId,
      chase_set_id: setId,
    });
  }, [updateProfile, user]);

  useEffect(() => {
    if (!authLoading) {
      refreshProfile();
    }
  }, [authLoading, refreshProfile]);

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading,
        error,
        refreshProfile,
        updateProfile,
        setFavoriteCard,
        setChaseCard,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
