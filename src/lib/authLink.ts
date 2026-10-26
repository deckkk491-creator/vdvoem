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

  // Принимаем только одноразовый code (PKCE): его можно обменять лишь на телефоне, где запросили письмо.
  // Готовые токены в ссылке не принимаем — так чужая ссылка не «подсунет» чужой аккаунт.
  if (!p.code) return false;
  const { data: current } = await supabase.auth.getSession();
  if (current.session) {
    const ok = await new Promise<boolean>((resolve) =>
      Alert.alert('Войти в другой аккаунт?', 'Ты уже вошёл. Если продолжить, текущий вход сменится на аккаунт из ссылки.', [
        { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Продолжить', onPress: () => resolve(true) },
      ]),
    );
    if (!ok) return true;
  }
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(p.code);
    if (error) throw error;
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    Alert.alert(
      'Не получилось войти',
      /code verifier|flow state|pkce/i.test(msg) ? 'Открой ссылку на том же телефоне, где запрашивал письмо, или введи код из письма.' : humanError(e),
    );
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
