import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { isConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

// Если .env не заполнен, создаём клиент-заглушку: приложение покажет экран настройки
// и не будет делать к нему запросов.
export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'https://placeholder.supabase.co',
  isConfigured ? SUPABASE_ANON_KEY : 'placeholder-anon-key-placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: isConfigured,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

if (isConfigured) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

const GENERIC_ERROR = 'Что-то пошло не так. Попробуй ещё раз.';

function field(e: unknown, key: string): string {
  if (e && typeof e === 'object' && key in e) {
    const v = (e as Record<string, unknown>)[key];
    return v === null || v === undefined ? '' : String(v);
  }
  return '';
}

/** Превращает ошибку Supabase/Postgres/сети в понятный русский текст. Подробности — только в консоль. */
export function humanError(e: unknown): string {
  const msg = typeof e === 'string' ? e : field(e, 'message');
  const code = field(e, 'code');
  const status = Number(field(e, 'status')) || 0;
  const name = field(e, 'name');

  if (__DEV__) console.warn('[humanError]', e);

  // Наши собственные сообщения (RPC и проверки в приложении) уже на русском
  if (/[а-яё]/i.test(msg) && !/[a-z]/i.test(msg)) return msg;

  if (/network request failed|fetch failed|failed to fetch|network ?error|timed? ?out|aborted|load failed/i.test(msg) || name === 'FunctionsFetchError' || name === 'AuthRetryableFetchError')
    return 'Нет связи с сервером. Проверь интернет.';
  if (/rate limit|too many/i.test(msg) || status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit')
    return 'Слишком много попыток. Подожди минуту и попробуй снова.';
  if (/jwt|not authenticated|refresh token|session.*(missing|not found)|auth session/i.test(msg) || code === '28000' || code === 'PGRST301' || code === 'session_not_found' || status === 401)
    return 'Сессия истекла — войди снова.';
  if (/token has expired|invalid.*otp|otp.*(invalid|expired)|otp_expired/i.test(msg) || code === 'otp_expired')
    return 'Код неверный или устарел. Запроси новый.';
  if (/invalid.*email|email.*invalid|email_address_invalid/i.test(msg) || code === 'email_address_invalid')
    return 'Проверь адрес почты.';
  if (/row-level security|permission denied/i.test(msg) || code === '42501' || status === 403)
    return 'Нет доступа к этим данным.';
  if (code === '23505' || /duplicate key/i.test(msg)) return 'Такая запись уже есть.';
  if (code === '23503' || /foreign key/i.test(msg)) return 'Запись уже удалили. Обнови экран.';
  if (code === 'PGRST116' || code === 'P0002') return 'Ничего не нашлось. Возможно, запись уже удалили.';
  if (code === '23514' || code === '23502' || code === '22P02' || code === '22003' || code === '22023' || /violates check constraint|invalid input syntax|out of range/i.test(msg))
    return 'Проверь введённые данные.';
  if (status >= 500 || /^5\d\d$/.test(code) || /internal server error|service unavailable|bad gateway/i.test(msg))
    return 'Сервер временно недоступен. Попробуй чуть позже.';
  return GENERIC_ERROR;
}
