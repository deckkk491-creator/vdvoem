const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** 'YYYY-MM-DD' → Date (локальная полночь) */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Date → 'YYYY-MM-DD' */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** «12 марта» или «12 марта 2027», если год не текущий */
export function formatDate(input: string | Date): string {
  const d = typeof input === 'string' ? (input.length <= 10 ? parseDate(input) : new Date(input)) : input;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** «через 3 дня», «сегодня», «5 дней назад» */
export function relativeDays(target: Date): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const t = new Date(target);
  t.setHours(0, 0, 0, 0);
  const diff = Math.round((t.getTime() - start.getTime()) / 86_400_000);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff === -1) return 'вчера';
  if (diff > 0) {
    if (diff >= 60) {
      const months = Math.round(diff / 30);
      return `через ${months} ${plural(months, 'месяц', 'месяца', 'месяцев')}`;
    }
    return `через ${diff} ${plural(diff, 'день', 'дня', 'дней')}`;
  }
  const n = -diff;
  return `${n} ${plural(n, 'день', 'дня', 'дней')} назад`;
}

/** «12 500 ₽» */
export function rub(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const [int, frac] = Math.abs(rounded).toFixed(2).split('.');
  const spaced = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rounded < 0 ? '−' : ''}${spaced}${frac === '00' ? '' : ',' + frac} ₽`;
}

/** Разбор суммы, введённой пользователем: «12 500,50» → 12500.5 */
export function parseAmount(s: string): number | null {
  const cleaned = s.replace(/\s| |₽/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Проверка и нормализация 'ДД.ММ.ГГГГ' или 'ГГГГ-ММ-ДД' → 'ГГГГ-ММ-ДД' */
export function normalizeDateInput(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  let y: number, m: number, d: number;
  const ru = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/.exec(t);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (ru) {
    d = Number(ru[1]);
    m = Number(ru[2]);
    y = Number(ru[3]);
    if (y < 100) y += 2000;
  } else if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return toISODate(date);
}

export function isoToRu(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function normalizeUrl(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withProto);
    return u.hostname.includes('.') ? u.toString() : null;
  } catch {
    return null;
  }
}

export function hostOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
