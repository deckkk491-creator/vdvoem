// Supabase Edge Function: link-preview
// Принимает { url } и возвращает { title, image, description, siteName, url }
// на основе Open Graph / Twitter / <title> тегов страницы.
// Деплой: supabase functions deploy link-preview
// Вызывать могут только вошедшие пользователи: токен проверяется в коде.
// Деплоить с отключённой проверкой JWT (--no-verify-jwt): новые ключи подписи ES256.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 600_000;
const TIMEOUT_MS = 8_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Адрес из частной/служебной сети (IPv4 или IPv6) */
function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivateIp(mapped[1]);
  // URL записывает ::ffff:127.0.0.1 как ::ffff:7f00:1 — такие адреса не пускаем совсем
  if (v.startsWith("::ffff:") || v.startsWith("::") && v !== "::") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (v.includes(":")) {
    return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v) ||
      v.startsWith("64:ff9b:") || v.startsWith("2001:db8:");
  }
  return false;
}

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || (!h.includes(".") && !h.includes(":"))) return true;
  if (/\.(local|localhost|internal|lan|home|arpa)$/.test(h)) return true;
  // десятичные/шестнадцатеричные записи IP (http://2130706433/) — не пускаем
  if (/^\d+$/.test(h) || /^0x[0-9a-f]+/i.test(h) || /^\d+\.\d+(\.\d+)?$/.test(h)) return true;
  return isPrivateIp(h);
}

/** Проверяет адрес до запроса: схема, порт, имя и все IP, в которые оно разрешается */
async function checkTarget(u: URL): Promise<boolean> {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  if (isPrivateHost(u.hostname)) return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^[\d.]+$/.test(host) || host.includes(":")) return true; // уже проверенный IP
  try {
    const [a4, a6] = await Promise.all([
      Deno.resolveDns(host, "A").catch(() => [] as string[]),
      Deno.resolveDns(host, "AAAA").catch(() => [] as string[]),
    ]);
    const all = [...a4, ...a6];
    if (!all.length) return false;
    return !all.some(isPrivateIp);
  } catch {
    // resolveDns недоступен в рантайме — остаётся проверка по имени
    return true;
  }
}

const UA = "Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php) VmesteLinkPreview/1.0";

/** fetch без автоматических редиректов: каждый следующий адрес проверяем заново (не больше 4 переходов) */
async function safeFetch(start: URL, signal: AbortSignal): Promise<{ res: Response; url: URL } | null> {
  let url = start;
  for (let hop = 0; hop < 5; hop++) {
    if (!(await checkTarget(url))) return null;
    const res = await fetch(url, {
      signal,
      redirect: "manual",
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "ru,en;q=0.8" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      try { await res.body?.cancel(); } catch { /* ignore */ }
      if (!loc) return null;
      try { url = new URL(loc, url); } catch { return null; }
      continue;
    }
    return { res, url };
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) {
    attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  }
  return attrs;
}

function extractMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const a = parseAttrs(m[0]);
    const key = (a["property"] ?? a["name"] ?? a["itemprop"] ?? "").toLowerCase();
    if (key && a["content"] && !(key in meta)) meta[key] = decodeEntities(a["content"]);
  }
  return meta;
}

function findJsonLdRecipe(html: string): { name?: string; image?: string } {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1].trim());
      const stack: unknown[] = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const node = stack.pop() as Record<string, unknown> | null;
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node["@graph"])) stack.push(...(node["@graph"] as unknown[]));
        const type = node["@type"];
        const isRecipe = type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
        if (isRecipe) {
          let image: unknown = node["image"];
          if (Array.isArray(image)) image = image[0];
          if (image && typeof image === "object") image = (image as Record<string, unknown>)["url"];
          return {
            name: typeof node["name"] === "string" ? node["name"] : undefined,
            image: typeof image === "string" ? image : undefined,
          };
        }
      }
    } catch {
      // некорректный JSON-LD — пропускаем
    }
  }
  return {};
}

function absolutize(maybe: string | undefined, base: URL): string | null {
  if (!maybe) return null;
  try {
    const u = new URL(maybe, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Только для вошедших пользователей. Проверяем токен через Auth API сами:
  // встроенная проверка JWT «legacy secret» не принимает новые ключи подписи (ES256).
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);
  try {
    const who = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
    });
    if (!who.ok) return json({ error: "unauthorized" }, 401);
  } catch {
    return json({ error: "auth_unavailable" }, 503);
  }

  let target: URL;
  try {
    const body = await req.json();
    target = new URL(String(body?.url ?? "").trim());
    if (!["http:", "https:"].includes(target.protocol)) throw new Error("bad protocol");
    if (isPrivateHost(target.hostname)) throw new Error("private host");
    if (target.toString().length > 2048) throw new Error("too long");
  } catch {
    return json({ error: "invalid_url" }, 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const got = await safeFetch(target, controller.signal);
    if (!got) return json({ error: "invalid_url" }, 400);
    const res = got.res;

    const finalUrl = got.url;
    const type = res.headers.get("content-type") ?? "";
    if (type.startsWith("image/")) {
      return json({ url: finalUrl.toString(), title: null, image: finalUrl.toString(), description: null, siteName: finalUrl.hostname });
    }
    if (!res.ok || !res.body) {
      return json({ url: finalUrl.toString(), title: null, image: null, description: null, siteName: finalUrl.hostname, error: `http_${res.status}` });
    }

    // Читаем не больше MAX_BYTES
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.byteLength;
    }
    try { await reader.cancel(); } catch { /* ignore */ }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }

    let charset = /charset=([^;]+)/i.exec(type)?.[1]?.trim().toLowerCase() ?? "utf-8";
    let html = new TextDecoder("utf-8").decode(buf);
    const metaCharset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(html)?.[1]?.toLowerCase();
    if (metaCharset && metaCharset !== "utf-8") charset = metaCharset;
    if (charset !== "utf-8" && charset !== "utf8") {
      try { html = new TextDecoder(charset).decode(buf); } catch { /* оставляем utf-8 */ }
    }

    const meta = extractMeta(html);
    const ld = findJsonLdRecipe(html);
    const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];

    const title =
      meta["og:title"] ?? meta["twitter:title"] ?? ld.name ?? (titleTag ? decodeEntities(titleTag) : null);
    const image = absolutize(
      meta["og:image:secure_url"] ?? meta["og:image"] ?? meta["og:image:url"] ?? meta["twitter:image"] ??
        meta["twitter:image:src"] ?? ld.image ?? meta["image"],
      finalUrl,
    );
    const description = meta["og:description"] ?? meta["twitter:description"] ?? meta["description"] ?? null;
    const siteName = meta["og:site_name"] ?? finalUrl.hostname.replace(/^www\./, "");
    // Цена товара (для вишлистов): Open Graph / product-теги / JSON-LD offers / microdata
    const rawPrice =
      meta["product:price:amount"] ?? meta["og:price:amount"] ?? meta["price"] ??
      /"offers"\s*:\s*\{[^}]*?"price"\s*:\s*"?([\d.,\s]+)"?/i.exec(html)?.[1] ??
      /itemprop=["']price["'][^>]*content=["']([\d.,\s]+)["']/i.exec(html)?.[1] ?? null;
    // «1,299.00» (en) → 1299; «1 299,50» (ru) → 1299.5; «1,299» → 1299 (запятая перед тремя цифрами — разряды)
    const normPrice = (v: string): number => {
      let t = v.replace(/\s/g, "");
      if (t.includes(",") && t.includes(".")) t = t.replace(/,/g, "");
      else if (/,\d{3}(?!\d)/.test(t) && !/,\d{1,2}$/.test(t)) t = t.replace(/,/g, "");
      else t = t.replace(",", ".");
      return Number(t);
    };
    const priceNum = rawPrice ? normPrice(String(rawPrice)) : NaN;
    const price = Number.isFinite(priceNum) && priceNum > 0 && priceNum < 1e9 ? Math.round(priceNum * 100) / 100 : null;

    return json({
      url: finalUrl.toString(),
      title: title ? title.slice(0, 200) : null,
      image,
      description: description ? description.slice(0, 500) : null,
      siteName,
      price,
    });
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return json({ url: target.toString(), title: null, image: null, description: null, siteName: target.hostname, error: aborted ? "timeout" : "fetch_failed" });
  } finally {
    clearTimeout(timer);
  }
});
