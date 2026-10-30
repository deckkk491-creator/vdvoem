// Публичные параметры проекта Supabase «vdvoem».
// Publishable key рассчитан на публикацию: доступ к данным ограничивают правила RLS в базе.
// Значения из .env / EAS env имеют приоритет (например, для отдельного тестового проекта).
const DEFAULT_SUPABASE_URL = 'https://lsdejadmrwuxiavgficc.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_oSrubEGO-L3oR5cGMPOfMw_LdHxyFEX';

export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim() || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim() || DEFAULT_SUPABASE_KEY;
export const DEFAULT_PRIVACY_URL = 'https://deckkk491-creator.github.io/vdvoem/privacy-policy.html';
export const PRIVACY_URL = (process.env.EXPO_PUBLIC_PRIVACY_URL ?? '').trim() || DEFAULT_PRIVACY_URL;

// Почта демо-аккаунта для ревьюера Apple (store/review-notes.md). Если переменная не задана, демо-входа нет.
// Для этой почты вместо кода из письма принимается код доступа (пароль пользователя в Supabase).
// Сам пароль в приложении не хранится: он только в Supabase и в App Store Connect.
export const DEMO_EMAIL = (process.env.EXPO_PUBLIC_DEMO_EMAIL ?? '').trim().toLowerCase();

export const isConfigured =
  /^https:\/\/.+/.test(SUPABASE_URL) &&
  !SUPABASE_URL.includes('xxxxxxxx') &&
  SUPABASE_ANON_KEY.length > 30;
