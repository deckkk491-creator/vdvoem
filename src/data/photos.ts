// Фото блюд и идей для свиданий и мест. Источник — Wikimedia Commons, только свободные лицензии
// (CC0, CC BY, CC BY-SA, public domain); автор и лицензия подписаны. Собрано скриптом scripts/fetch_photos.py.
import ideaRaw from './ideaPhotos.json';
import mealRaw from './mealPhotos.json';

export type FreePhoto = { url: string; author: string; license: string; source: string };

const MEALS = mealRaw as Record<string, FreePhoto>;
const IDEAS = ideaRaw as Record<string, FreePhoto>;

/** Фото встроенного блюда по id (b1, l3, d10…) */
export function mealPhoto(id: string): FreePhoto | null {
  return MEALS[id] ?? null;
}

/** Фото идеи свидания (d1…) или места (p1…) */
export function ideaPhoto(id: string): FreePhoto | null {
  return IDEAS[id] ?? null;
}
