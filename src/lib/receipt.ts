/**
 * Разбор QR-кода кассового чека (формат ФНС России).
 * В QR-коде бумажного чека и в ссылке из электронного чека одна и та же строка:
 *   t=20261112T1830&s=1234.50&fn=7380440700000000&i=12345&fp=1234567890&n=1
 * t — дата и время, s — сумма в рублях, n — признак расчёта.
 * Список товаров в QR-коде не хранится: для него нужен сервис проверки чеков ФНС.
 */

export type ReceiptKind = 'expense' | 'income';

export type ReceiptData = {
  /** Сумма в рублях */
  amount: number;
  /** Дата чека в формате ГГГГ-ММ-ДД */
  date: string;
  /** Время чека ЧЧ:ММ */
  time: string;
  /** Покупка — расход; возврат покупки — доход */
  kind: ReceiptKind;
};

/** Признак расчёта n: 1 — приход (покупка), 2 — возврат прихода, 3 — расход, 4 — возврат расхода */
const KIND_BY_N: Record<string, ReceiptKind> = { '1': 'expense', '2': 'income', '3': 'income', '4': 'expense' };

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

/** Достаёт параметры вида key=value из строки: из QR-кода, из ссылки или из текста письма */
function params(raw: string): Record<string, string> {
  // Ссылка из письма может прийти закодированной (%26 вместо &) — раскодируем до двух раз
  const text = safeDecode(safeDecode(raw));
  const out: Record<string, string> = {};
  const re = /(?:^|[?&\s;#])([a-zA-Z]{1,3})=([^&\s#;]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const key = m[1].toLowerCase();
    if (!(key in out)) out[key] = m[2];
  }
  return out;
}

/** Разбирает строку из QR-кода или ссылку из электронного чека. Не чек — null. */
export function parseReceipt(raw: string): ReceiptData | null {
  if (!raw) return null;
  const p = params(raw.trim());
  if (!p.t || !p.s) return null;

  const t = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/.exec(p.t);
  if (!t) return null;
  const [, y, mo, d, h, mi] = t;
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const amount = Number(p.s.replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1_000_000_000) return null;

  return {
    amount: Math.round(amount * 100) / 100,
    date: `${y}-${mo}-${d}`,
    time: `${h}:${mi}`,
    kind: KIND_BY_N[p.n ?? '1'] ?? 'expense',
  };
}
