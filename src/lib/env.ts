export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
export const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
export const DEFAULT_PRIVACY_URL = 'https://deckkk491-creator.github.io/vdvoem/privacy-policy.html';
export const PRIVACY_URL = (process.env.EXPO_PUBLIC_PRIVACY_URL ?? '').trim() || DEFAULT_PRIVACY_URL;

export const isConfigured =
  /^https:\/\/.+/.test(SUPABASE_URL) &&
  !SUPABASE_URL.includes('xxxxxxxx') &&
  SUPABASE_ANON_KEY.length > 30;
