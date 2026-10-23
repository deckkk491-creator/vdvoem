import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { humanError, supabase } from './supabase';

/** Куда ведёт ссылка из письма: vdvoem://auth-callback (в Expo Go — exp://…/--/auth-callback). */
export const AUTH_REDIRECT_URL = Linking.createURL('auth-callback');

function parseParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (part: string | undefined) => {
    if (!part) return;
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const i = pair.indexOf('=');
      const k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i));
      const v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      out[k] = v;
    }
  };
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt < 0 ? url : url.slice(0, hashAt);
  const qAt = beforeHash.indexOf('?');
  add(qAt < 0 ? undefined : beforeHash.slice(qAt + 1));
  add(hashAt < 0 ? undefined : url.slice(hashAt + 1));
  return out;
}

const handled = new Set<string>();

/** Входит по ссылке из письма. Возвращает true, если ссылка была ссылкой для входа. */
export async function signInFromUrl(url: string | null): Promise<boolean> {
  if (!url || !url.includes('auth-callback') || handled.has(url)) return false;
  handled.add(url);
  const p = parseParams(url);

  if (p.error || p.error_description) {
    const expired = /expired|invalid/i.test(`${p.error_code ?? ''} ${p.error_description ?? ''}`);
    Alert.alert(
      'Ссылка не сработала',
      expired ? 'Ссылка устарела или уже использована. Запроси новое письмо.' : 'Попробуй войти ещё раз.',
    );
    return true;
  }

  try {
    if (p.access_token && p.refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token });
      if (error) throw error;
    } else if (p.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(p.code);
      if (error) throw error;
    } else if (p.token_hash) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: p.token_hash, type: 'email' });
      if (error) throw error;
    } else {
      return false;
    }
  } catch (e) {
    Alert.alert('Не получилось войти', humanError(e));
  }
  // при успехе Gate сам переведёт на нужный экран
  return true;
}

/** Слушает ссылки, которыми открыли приложение (и при холодном старте, и когда оно уже запущено). */
export function useAuthDeepLinks() {
  useEffect(() => {
    Linking.getInitialURL().then(signInFromUrl).catch(() => undefined);
    const sub = Linking.addEventListener('url', ({ url }) => {
      signInFromUrl(url).catch(() => undefined);
    });
    return () => sub.remove();
  }, []);
}
