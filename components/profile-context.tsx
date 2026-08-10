import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
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
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: any }>;
  setFavoriteCard: (cardId: string, setId: string) => Promise<void>;
  setChaseCard: (cardId: string, setId: string) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  updateProfile: async () => ({ error: null }),
  setFavoriteCard: async () => {},
  setChaseCard: async () => {},
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!error && data) {
      setProfile(data as Profile);
    } else {
      setProfile(null);
    }

    setLoading(false);
  }, [user]);

  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!user) return { error: 'No user' };

    const {
      id: _ignoredId,
      email: _ignoredEmail,
      role: _ignoredRole,
      created_at: _ignoredCreatedAt,
      ...publicUpdates
    } = updates;

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          ...publicUpdates,
        },
        { onConflict: 'id' }
      );

    if (!error) {
      await refreshProfile();
    }

    return { error };
  }, [refreshProfile, user]);

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
