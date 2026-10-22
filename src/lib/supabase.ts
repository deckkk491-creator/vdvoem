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

/** Превращает ошибку Supabase/сети в понятный русский текст */
export function humanError(e: unknown): string {
  const msg =
    typeof e === 'string'
      ? e
      : e && typeof e === 'object' && 'message' in e
        ? String((e as { message: unknown }).message)
        : 'Неизвестная ошибка';
  if (/network request failed|fetch failed/i.test(msg)) return 'Нет связи с сервером. Проверьте интернет.';
  if (/token has expired|invalid.*otp|otp.*invalid|expired/i.test(msg)) return 'Код неверный или устарел. Запросите новый.';
  if (/rate limit|too many/i.test(msg)) return 'Слишком много попыток. Подождите минуту и попробуйте снова.';
  if (/row-level security/i.test(msg)) return 'Нет доступа к этим данным.';
  if (/not authenticated|JWT/i.test(msg)) return 'Сессия истекла — войдите снова.';
  return msg;
}
