// Supabase Edge Function: yandex-signin
// Вход через Яндекс ID (российская система авторизации, разрешённая 149-ФЗ в ред. 406-ФЗ).
//
// Как работает:
// 1) приложение открывает страницу входа Яндекса и получает OAuth-токен (response_type=token);
// 2) присылает токен сюда; функция спрашивает у Яндекса, чей это токен (login.yandex.ru/info),
//    и проверяет, что токен выдан именно нашему приложению (client_id), а не чужому;
// 3) берёт почту Яндекс ID (она подтверждена Яндексом) — только российского сервиса, как требует миграция 0007;
// 4) создаёт пользователя, если его ещё нет, и выдаёт одноразовый токен входа (как в письме).
//    Приложение обменивает его на сессию через verifyOtp({ token_hash }).
//    Если раньше человек входил по коду из письма с той же почтой, это тот же аккаунт.
//
// Настройка (Supabase → Edge Functions → Secrets): YANDEX_CLIENT_ID — ClientID приложения на oauth.yandex.ru
// (права: «Доступ к адресу электронной почты»). Verify JWT выключить: до входа у пользователя нет сессии.
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY доступны в Edge Functions автоматически.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Тот же список, что в миграции 0007 (по умолчанию) — почта Яндекс ID почти всегда @yandex.ru
const RU_DOMAINS = new Set([
  "yandex.ru", "ya.ru", "yandex.com", "yandex.by", "yandex.kz", "narod.ru",
  "mail.ru", "inbox.ru", "list.ru", "bk.ru", "internet.ru",
  "rambler.ru", "lenta.ru", "autorambler.ru", "myrambler.ru", "ro.ru",
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

type YandexInfo = {
  id?: string;
  login?: string;
  client_id?: string;
  default_email?: string;
  emails?: string[];
};

function pickEmail(info: YandexInfo): string | null {
  const all = [info.default_email, ...(info.emails ?? [])]
    .filter((e): e is string => typeof e === "string" && e.includes("@"))
    .map((e) => e.trim().toLowerCase());
  return all.find((e) => RU_DOMAINS.has(e.slice(e.lastIndexOf("@") + 1))) ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const clientId = (Deno.env.get("YANDEX_CLIENT_ID") ?? "").trim();
  if (!clientId) return json({ error: "not_configured" }, 503);

  let token = "";
  try {
    const body = await req.json();
    token = typeof body?.access_token === "string" ? body.access_token.trim() : "";
  } catch {
    // пустое или битое тело — ответим ниже
  }
  if (!token || token.length > 512) return json({ error: "bad_request" }, 400);

  // Кто владелец токена — спрашиваем у самого Яндекса
  let info: YandexInfo;
  try {
    const r = await fetch("https://login.yandex.ru/info?format=json", {
      headers: { Authorization: `OAuth ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 401) return json({ error: "yandex_token_invalid" }, 401);
    if (!r.ok) return json({ error: "yandex_unavailable" }, 502);
    info = await r.json();
  } catch {
    return json({ error: "yandex_unavailable" }, 502);
  }

  // Токен, выданный другому приложению, не принимаем: иначе чужой сервис мог бы войти от имени своих пользователей
  if (!info.id || info.client_id !== clientId) return json({ error: "yandex_token_invalid" }, 401);

  const email = pickEmail(info);
  if (!email) return json({ error: "yandex_no_email" }, 422);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Новый пользователь — создаём с подтверждённой почтой; существующий — просто входим
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { yandex_id: info.id },
  });
  if (createErr && !/already|exists|registered/i.test(`${createErr.code ?? ""} ${createErr.message}`)) {
    console.warn("createUser", createErr.message);
    return json({ error: "create_user_failed" }, 500);
  }

  const { data, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    console.warn("generateLink", linkErr?.message);
    return json({ error: "sign_in_failed" }, 500);
  }

  return json({ token_hash: tokenHash, email });
});
