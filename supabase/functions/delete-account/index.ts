// Supabase Edge Function: delete-account
// Полностью удаляет аккаунт вызывающего пользователя (Apple App Store Guideline 5.1.1(v)).
// 1) от имени пользователя вызывает RPC delete_my_data() — чистит его данные;
// 2) через service role удаляет запись из auth.users.
// Деплой: supabase functions deploy delete-account
// SUPABASE_URL, SUPABASE_ANON_KEY и SUPABASE_SERVICE_ROLE_KEY доступны в Edge Functions автоматически.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Клиент от имени пользователя — RLS и auth.uid() работают как в приложении
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;

  const { error: rpcErr } = await userClient.rpc("delete_my_data");
  if (rpcErr) return json({ error: "delete_data_failed", details: rpcErr.message }, 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return json({ error: "delete_user_failed", details: delErr.message }, 500);

  return json({ ok: true });
});
