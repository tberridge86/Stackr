import React, { createContext, useContext, useEffect, useState } from 'react';
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

  favorite_card_id: string | null;
  favorite_set_id: string | null;
  chase_card_id: string | null;
  chase_set_id: string | null;

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

  const refreshProfile = async () => {
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
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: 'No user' };

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (!error) {
      await refreshProfile();
    }

    return { error };
  };

  const setFavoriteCard = async (cardId: string, setId: string) => {
    if (!user) return;

    await updateProfile({
      favorite_card_id: cardId,
      favorite_set_id: setId,
    });
  };

  const setChaseCard = async (cardId: string, setId: string) => {
    if (!user) return;

    await updateProfile({
      chase_card_id: cardId,
      chase_set_id: setId,
    });
  };

  useEffect(() => {
    if (!authLoading) {
      refreshProfile();
    }
  }, [user, authLoading]);

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