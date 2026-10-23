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

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "[::1]" || h.startsWith("[fc") || h.startsWith("[fd") || h.startsWith("[fe80")) return true;
  return false;
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
  } catch {
    return json({ error: "invalid_url" }, 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Многие соцсети отдают OG-теги только «ботам»-превьюшникам
        "User-Agent":
          "Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php) VdvoemLinkPreview/1.0",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ru,en;q=0.8",
      },
    });

    const finalUrl = new URL(res.url || target.toString());
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

    return json({
      url: finalUrl.toString(),
      title: title ? title.slice(0, 200) : null,
      image,
      description: description ? description.slice(0, 500) : null,
      siteName,
    });
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return json({ url: target.toString(), title: null, image: null, description: null, siteName: target.hostname, error: aborted ? "timeout" : "fetch_failed" });
  } finally {
    clearTimeout(timer);
  }
});
