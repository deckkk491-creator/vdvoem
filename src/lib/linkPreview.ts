import { supabase } from './supabase';

export type LinkPreview = {
  url: string;
  title: string | null;
  image: string | null;
  description: string | null;
  siteName: string | null;
  error?: string;
};

/** Вызывает Edge Function link-preview. При любой ошибке возвращает null — UI откатывается на ручной ввод. */
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000));
    const call = supabase.functions
      .invoke<LinkPreview>('link-preview', { body: { url } })
      .then(({ data, error }) => (error || !data ? null : data));
    return await Promise.race([call, timeout]);
  } catch {
    return null;
  }
}
