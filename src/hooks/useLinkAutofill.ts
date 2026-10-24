import * as Clipboard from 'expo-clipboard';
import { useCallback, useRef, useState } from 'react';
import { normalizeUrl } from '../lib/format';
import { fetchLinkPreview, type LinkPreview } from '../lib/linkPreview';

/**
 * Автозаполнение по ссылке (как в «Рецептах»): читает страницу через Edge Function link-preview
 * и отдаёт найденное в apply — форма сама решает, какие поля заполнить (только пустые).
 */
export function useLinkAutofill(apply: (p: LinkPreview) => void) {
  const [fetching, setFetching] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const reset = useCallback((initialUrl: string | null) => {
    last.current = initialUrl;
    setHint(null);
    setFetching(false);
  }, []);

  const autofill = useCallback(async (raw: string) => {
    const link = normalizeUrl(raw);
    if (!link || last.current === link) return;
    last.current = link;
    setFetching(true);
    setHint(null);
    const p = await fetchLinkPreview(link);
    // пока читали, ссылку могли поменять — устаревший ответ не применяем
    if (last.current !== link) return;
    setFetching(false);
    if (!p || (!p.title && !p.image && !p.description)) {
      setHint('Не получилось прочитать страницу — заполни поля вручную.');
      return;
    }
    applyRef.current(p);
    setHint(p.siteName ? `Подтянули данные с ${p.siteName} ✨` : 'Подтянули данные со страницы ✨');
  }, []);

  /** Берёт ссылку из буфера обмена; возвращает её, чтобы форма положила в поле */
  const paste = useCallback(async (): Promise<string | null> => {
    const text = (await Clipboard.getStringAsync().catch(() => '')).trim();
    const match = text.match(/https?:\/\/\S+/);
    const value = match ? match[0] : text;
    if (!value) return null;
    autofill(value);
    return value;
  }, [autofill]);

  return { fetching, hint, autofill, paste, reset };
}
