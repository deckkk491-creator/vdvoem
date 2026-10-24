import { router, Stack, useRootNavigationState, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { isConfigured } from '../src/lib/env';
import { AuthProvider, useAuth } from '../src/providers/AuthProvider';
import { SpaceProvider, useSpace } from '../src/providers/SpaceProvider';
import { RuleReminderSync } from '../src/components/RuleReminderSync';
import { useAuthDeepLinks } from '../src/lib/authLink';
import { UnreadProvider } from '../src/hooks/useUnread';
import { ThemeProvider, useTheme } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const IN_APP = ['(tabs)', 'wishlists', 'rule222', 'settings', 'onboarding', 'savings', 'dates', 'chat'];

type Target = '/setup' | '/sign-in' | '/onboarding' | '/(tabs)/calendar' | null;

function useGateTarget(): Target {
  const { ready, session, profile, profileLoaded } = useAuth();
  const { loaded, space } = useSpace();
  if (!isConfigured) return '/setup';
  if (!ready) return null;
  if (!session) return '/sign-in';
  if (!profileLoaded || !loaded) return null;
  if (!profile?.display_name || !space) return '/onboarding';
  return '/(tabs)/calendar';
}

function Gate() {
  const target = useGateTarget();
  const segments = useSegments();
  const navReady = !!useRootNavigationState()?.key;
  const first = segments[0] as string | undefined;

  useEffect(() => {
    if (target === null || !navReady) return;
    SplashScreen.hideAsync().catch(() => undefined);
    const at: Record<Exclude<Target, null>, boolean> = {
      '/setup': first === 'setup',
      '/sign-in': first === 'sign-in',
      '/onboarding': first === 'onboarding',
      // с онбординга уходим сами (чтобы успеть показать код приглашения)
      '/(tabs)/calendar': !!first && IN_APP.includes(first),
    };
    if (!at[target]) router.replace(target);
  }, [target, first, navReady]);

  return null;
}

function AuthLinks() {
  useAuthDeepLinks();
  return null;
}

function Shell() {
  const { c, dark } = useTheme();
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <AuthLinks />
      <Gate />
      <RuleReminderSync />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.accent,
          headerTitleStyle: { color: c.text, fontWeight: '700' },
          headerShadowVisible: false,
          headerBackTitle: 'Назад',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="auth-callback" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="wishlists" options={{ headerShown: true, title: 'Вишлисты' }} />
        <Stack.Screen name="rule222" options={{ headerShown: true, title: 'Правило 2-2-2' }} />
        <Stack.Screen name="settings" options={{ headerShown: true, title: 'Настройки', presentation: 'modal' }} />
        <Stack.Screen name="savings" />
        <Stack.Screen name="dates" options={{ headerShown: true, title: 'Важные даты' }} />
        <Stack.Screen name="chat" options={{ headerShown: true, title: 'Чат' }} />
      </Stack>
    </>
  );
}

function ThemedShell() {
  const { profile } = useAuth();
  return (
    <ThemeProvider remote={profile ? { accent: profile.theme_accent, mode: profile.theme_mode } : null}>
      <Shell />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SpaceProvider>
          <UnreadProvider>
            <ThemedShell />
          </UnreadProvider>
        </SpaceProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
