import { readPageInBrowser, type PageData } from '../components/PageReader';
import { supabase } from './supabase';

export type LinkPreview = {
  url: string;
  title: string | null;
  image: string | null;
  description: string | null;
  siteName: string | null;
  /** Цена товара, если страница её отдаёт (для вишлистов) */
  price?: number | null;
  error?: string;
};

/** Маркетплейсы, которые не отдают данные серверу — их читаем в браузере телефона */
const MARKETPLACES: { re: RegExp; name: string }[] = [
  { re: /(^|\.)ozon\.(ru|by|kz)$/i, name: 'Ozon' },
  { re: /(^|\.)(wildberries\.(ru|by|kz|am|kg|uz)|wb\.ru)$/i, name: 'Wildberries' },
  { re: /(^|\.)market\.yandex\.ru$|(^|\.)ya\.cc$/i, name: 'Яндекс Маркет' },
  { re: /(^|\.)avito\.ru$/i, name: 'Авито' },
  { re: /(^|\.)(aliexpress\.(ru|com|us)|ali\.ski|a\.aliexpress\.com)$/i, name: 'AliExpress' },
  { re: /(^|\.)(lamoda\.ru|megamarket\.ru|dns-shop\.ru|mvideo\.ru|eldorado\.ru|goldapple\.ru|detmir\.ru|letu\.ru)$/i, name: '' },
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function marketplaceName(url: string): string | null {
  const h = hostOf(url);
  const m = MARKETPLACES.find((x) => x.re.test(h));
  return m ? m.name || h.replace(/^www\./, '') : null;
}

const SEO_TAIL = /\s*(?:[—–|-]\s*)?(?:купить|заказать|покупайте|по выгодн|по низк|в интернет[‑-]?магазине|на (?:OZON|Ozon|Яндекс Маркете|Wildberries|Авито|AliExpress)).*$/i;
const SEO = /(покупайте|купить|заказать|по выгодн|по низк|в интернет[‑-]?магазине|быстрая и бесплатная доставка|отзывы покупателей)/i;

function cleanTitle(t: string | null | undefined): string | null {
  if (!t) return null;
  const s = t.replace(/\s+/g, ' ').replace(SEO_TAIL, '').replace(/\s+\d{6,}$/, '').trim();
  return s ? s.slice(0, 200) : null;
}

function cleanDescription(d: string | null | undefined, title: string | null): string | null {
  if (!d) return null;
  let s = d.replace(/\s+/g, ' ').trim();
  if (SEO.test(s.slice(0, 200))) s = s.replace(SEO_TAIL, '').replace(/\s+\d{6,}$/, '').trim();
  // Описание, которое просто повторяет название, не нужно
  if (!s || (title && s.toLowerCase() === title.toLowerCase())) return null;
  return s.slice(0, 1000);
}

/** Wildberries отдаёт полное описание отдельным файлом рядом с фото товара */
async function wildberriesDescription(image: string | null): Promise<string | null> {
  if (!image) return null;
  const m = image.match(/^(https:\/\/[^/]+\/vol\d+\/part\d+\/\d+)\/images\//);
  if (!m) return null;
  try {
    const r = await withTimeout(fetch(`${m[1]}/info/ru/card.json`), 6000);
    if (!r || !r.ok) return null;
    const j = (await r.json()) as { description?: string };
    return j.description?.trim() || null;
  } catch {
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** Edge Function link-preview (сервер в Европе). Хорошо читает обычные сайты и соцсети. */
async function fromServer(url: string): Promise<LinkPreview | null> {
  try {
    const call = supabase.functions
      .invoke<LinkPreview>('link-preview', { body: { url } })
      .then(({ data, error }) => (error || !data ? null : data));
    return await withTimeout(call, 12_000);
  } catch {
    return null;
  }
}

function fromPage(d: PageData | null, fallbackSite: string | null): LinkPreview | null {
  if (!d || d.blocked || (!d.title && !d.image)) return null;
  const title = cleanTitle(d.title);
  return {
    url: d.url,
    title,
    image: d.image,
    description: cleanDescription(d.description, title),
    siteName: fallbackSite || d.siteName,
    price: d.price ?? null,
  };
}

/** Склеивает два результата: берёт непустые поля, предпочитая первый */
function merge(a: LinkPreview | null, b: LinkPreview | null): LinkPreview | null {
  if (!a) return b;
  if (!b) return a;
  return {
    url: a.url || b.url,
    title: a.title || b.title,
    image: a.image || b.image,
    description: a.description || b.description,
    siteName: a.siteName || b.siteName,
    price: a.price ?? b.price ?? null,
  };
}

const complete = (p: LinkPreview | null) => !!p && !!p.title && !!p.image && !!p.description;

/**
 * Данные по ссылке: название, описание, картинка и цена.
 * Маркетплейсы читаем в браузере телефона (с российского адреса и как обычный посетитель),
 * остальное — сервером, а если сервер не справился, тоже браузером.
 * При любой ошибке возвращает null — форма откатывается на ручной ввод.
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  const market = marketplaceName(url);
  let result: LinkPreview | null;
  if (market) {
    result = fromPage(await readPageInBrowser(url), market);
    if (!complete(result)) result = merge(result, await fromServer(url));
  } else {
    result = await fromServer(url);
    if (!complete(result)) result = merge(result, fromPage(await readPageInBrowser(url), null));
  }
  if (result && /wildberries|wb\.ru|geobasket|wbbasket/i.test(`${result.url} ${result.image ?? ''}`)) {
    const full = await wildberriesDescription(result.image);
    if (full) result = { ...result, description: full.slice(0, 1000) };
  }
  if (result) {
    result = { ...result, title: cleanTitle(result.title), description: cleanDescription(result.description, cleanTitle(result.title)) };
  }
  return result && (result.title || result.image) ? result : null;
}
