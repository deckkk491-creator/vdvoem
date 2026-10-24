import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isExportEnabled, removeExportedEvents, setExportEnabled } from '../lib/deviceCalendar';
import { isConfigured } from '../lib/env';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

type AuthState = {
  ready: boolean;
  session: Session | null;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  profileLoaded: boolean;
  refreshProfile: () => Promise<void>;
  saveProfile: (p: Partial<Omit<Profile, 'id'>>) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!isConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileFor, setProfileFor] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isConfigured) return;
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setSession(data.session);
      })
      .finally(() => mounted && setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;
  const userRef = useRef(userId);
  userRef.current = userId;
  const profileLoaded = profileFor === userId;

  const refreshProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setProfileFor(null);
      return;
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    // пока шёл запрос, пользователь мог выйти или смениться — чужой профиль не применяем
    if (userRef.current !== userId) return;
    if (!error) setProfile((data as Profile | null) ?? null);
    else setProfile((p) => (p?.id === userId ? p : null));
    setProfileFor(userId);
  }, [userId]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const saveProfile = useCallback(
    async (p: Partial<Omit<Profile, 'id'>>) => {
      if (!userId) throw new Error('not authenticated');
      const { data, error } = await supabase
        .from('profiles')
        .upsert({ id: userId, ...p }, { onConflict: 'id' })
        .select('*')
        .single();
      if (error) throw error;
      setProfile(data as Profile);
    },
    [userId],
  );

  const signOut = useCallback(async () => {
    // Общие события не должны оставаться в календаре iPhone после выхода из аккаунта
    if (await isExportEnabled().catch(() => false)) {
      await removeExportedEvents().catch(() => false);
      await setExportEnabled(false).catch(() => undefined);
    }
    // Без сети supabase.auth.signOut() возвращает ошибку и НЕ удаляет сессию с устройства —
    // тогда выходим хотя бы локально, чтобы кнопка «Выйти» работала всегда.
    const { error } = await supabase.auth.signOut().catch((e: unknown) => ({ error: e }));
    if (error) {
      console.warn('signOut', error);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    setProfile(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      userId,
      email: session?.user.email ?? null,
      profile,
      profileLoaded,
      refreshProfile,
      saveProfile,
      signOut,
    }),
    [ready, session, userId, profile, profileLoaded, refreshProfile, saveProfile, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
