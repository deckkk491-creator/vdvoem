export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
export const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
export const PRIVACY_URL = (process.env.EXPO_PUBLIC_PRIVACY_URL ?? '').trim();

export const isConfigured =
  /^https:\/\/.+/.test(SUPABASE_URL) &&
  !SUPABASE_URL.includes('xxxxxxxx') &&
  SUPABASE_ANON_KEY.length > 30;
