import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const allowedOrigins = new Set([
  "https://mdmoazzam291.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://mdmoazzam291.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(req, { error: "Authentication required." }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    console.error("delete-account: missing Supabase service configuration");
    return json(req, { error: "Account deletion is temporarily unavailable." }, 503);
  }

  let payload: { confirmation?: string };
  try {
    payload = await req.json();
  } catch {
    return json(req, { error: "Invalid request." }, 400);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  const token = authHeader.slice("Bearer ".length);
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) {
    return json(req, { error: "Your session is no longer valid. Sign in again and retry." }, 401);
  }

  const expected = (user.email || "DELETE").trim();
  const confirmation = String(payload?.confirmation || "").trim();
  if (!confirmation || confirmation.toLowerCase() !== expected.toLowerCase()) {
    return json(req, {
      error: user.email
        ? "Type your account email exactly to confirm deletion."
        : "Type DELETE to confirm deletion."
    }, 400);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("delete-account: admin delete failed", deleteError.message);
    const storageBlocked = /storage|object|owner/i.test(deleteError.message || "");
    return json(req, {
      error: storageBlocked
        ? "Account deletion is blocked by files owned in Storage. Remove those files and retry."
        : "Account deletion could not complete. Please try again."
    }, storageBlocked ? 409 : 500);
  }

  return json(req, { deleted: true });
});
