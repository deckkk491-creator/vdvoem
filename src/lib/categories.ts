export const WEEKEND_CATEGORIES = ['театр', 'кино', 'ресторан', 'прогулка', 'выставка', 'активность', 'другое'] as const;
export type WeekendCategory = (typeof WEEKEND_CATEGORIES)[number];
export const CATEGORY_EMOJI: Record<WeekendCategory, string> = {
  театр: '🎭',
  кино: '🎬',
  ресторан: '🍽️',
  прогулка: '🚶',
  выставка: '🖼️',
  активность: '⚡️',
  другое: '✨',
};
