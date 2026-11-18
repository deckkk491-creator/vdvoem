import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';
import { YANDEX_CALLBACK_PAGE, YANDEX_CLIENT_ID } from './env';
import { humanError, supabase } from './supabase';

/**
 * Вход через Яндекс ID.
 * 1. Открываем страницу входа Яндекса во встроенном окне браузера (response_type=token).
 * 2. Яндекс возвращает токен на нашу страницу docs/yandex-callback.html, она передаёт его в приложение
 *    по ссылке vdvoem://yandex-callback (в Expo Go — exp://…/--/yandex-callback).
 * 3. Токен проверяет функция yandex-signin на сервере и выдаёт одноразовый токен входа.
 *
 * Кнопка показывается, только если задан EXPO_PUBLIC_YANDEX_CLIENT_ID.
 * Ошибки показываем через Alert: экран входа за это время может пересоздаться (Android открывает приложение по ссылке).
 */
export const yandexSignInAvailable = YANDEX_CLIENT_ID !== '';

const APP_RETURN_URL = Linking.createURL('yandex-callback');

function randomState(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += Math.random().toString(36).slice(2, 10);
  return s;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url без «=» для ASCII-строки (адрес возврата в приложение) */
export function toBase64Url(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 3) {
    const a = text.charCodeAt(i) & 0xff;
    const b = i + 1 < text.length ? text.charCodeAt(i + 1) & 0xff : -1;
    const c = i + 2 < text.length ? text.charCodeAt(i + 2) & 0xff : -1;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b < 0 ? 0 : b >> 4)];
    if (b >= 0) out += B64[((b & 15) << 2) | (c < 0 ? 0 : c >> 6)];
    if (c >= 0) out += B64[c & 63];
  }
  return out;
}

function parseFragment(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const hashAt = url.indexOf('#');
  const qAt = url.indexOf('?');
  const part = hashAt >= 0 ? url.slice(hashAt + 1) : qAt >= 0 ? url.slice(qAt + 1) : '';
  for (const pair of part.split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    const k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i));
    out[k] = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
  }
  return out;
}

const SERVER_ERRORS: Record<string, string> = {
  yandex_no_email: 'В твоём Яндекс ID нет почты Яндекса. Войди по почте или добавь почту в Яндекс ID.',
  yandex_token_invalid: 'Яндекс не подтвердил вход. Попробуй ещё раз.',
  yandex_unavailable: 'Яндекс сейчас не отвечает. Попробуй чуть позже или войди по почте.',
  not_configured: 'Вход через Яндекс ещё не настроен. Войди по почте.',
};

async function serverErrorText(e: unknown): Promise<string> {
  const ctx = (e as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (ctx?.json) {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error && SERVER_ERRORS[body.error]) return SERVER_ERRORS[body.error];
    } catch {
      // тело не JSON — покажем общую ошибку
    }
  }
  return humanError(e);
}

let running = false;

/** Возвращает true, если вход прошёл (дальше Gate сам переведёт на нужный экран). */
export async function signInWithYandex(): Promise<boolean> {
  if (!yandexSignInAvailable || running) return false;
  running = true;
  try {
    const nonce = randomState();
    // В state — случайная строка и адрес возврата в приложение: страница-посредник отправит токен только туда
    const state = `${nonce}.${toBase64Url(APP_RETURN_URL)}`;
    const authUrl =
      'https://oauth.yandex.ru/authorize?response_type=token' +
      `&client_id=${encodeURIComponent(YANDEX_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(YANDEX_CALLBACK_PAGE)}` +
      `&state=${encodeURIComponent(state)}` +
      '&force_confirm=no';

    const res = await WebBrowser.openAuthSessionAsync(authUrl, APP_RETURN_URL);
    if (res.type !== 'success' || !res.url) return false; // закрыли окно — молча

    const p = parseFragment(res.url);
    if (p.error) {
      if (p.error !== 'access_denied') Alert.alert('Не получилось войти', 'Яндекс не подтвердил вход. Попробуй ещё раз.');
      return false;
    }
    if (p.state !== state || !p.access_token) {
      Alert.alert('Не получилось войти', 'Попробуй войти через Яндекс ещё раз.');
      return false;
    }

    const { data, error } = await supabase.functions.invoke('yandex-signin', { body: { access_token: p.access_token } });
    if (error || !data?.token_hash) {
      Alert.alert('Не получилось войти', error ? await serverErrorText(error) : 'Попробуй ещё раз.');
      return false;
    }
    const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
    if (vErr) {
      Alert.alert('Не получилось войти', humanError(vErr));
      return false;
    }
    return true;
  } catch (e) {
    Alert.alert('Не получилось войти', humanError(e));
    return false;
  } finally {
    running = false;
  }
}
