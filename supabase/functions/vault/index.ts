// Edge Function "vault" — único ponto que cifra/decifra credenciais.
// - Valida o JWT do utilizador e o estado da conta (approved).
// - Todas as operações na base de dados usam o JWT do próprio utilizador,
//   portanto o RLS continua a aplicar-se (defesa em profundidade).
// - A chave (VAULT_KEYS) existe só nos segredos da função.
// - Nunca regista credenciais em logs.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { decryptField, encryptField, loadKeyRing, type KeyRing } from "../_shared/crypto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",").map((s) => s.trim());
const MAX_FAILED_REVEALS = 5;
const LOCK_MINUTES = 15;

let ringPromise: Promise<KeyRing> | null = null;
const ring = () => (ringPromise ??= loadKeyRing(Deno.env.get("VAULT_KEYS")));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes("*") ? "*" : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function str(v: unknown, field: string, { max, required = true }: { max: number; required?: boolean }): string | null {
  if (v === undefined || v === null || v === "") {
    if (required) throw new HttpError(400, `missing_${field}`);
    return null;
  }
  if (typeof v !== "string") throw new HttpError(400, `invalid_${field}`);
  const t = field === "password" ? v : v.trim();
  if (required && t.length === 0) throw new HttpError(400, `missing_${field}`);
  if (t.length > max) throw new HttpError(400, `too_long_${field}`);
  return t.length ? t : null;
}

function uuid(v: unknown, field = "id"): string {
  if (typeof v !== "string" || !UUID_RE.test(v)) throw new HttpError(400, `invalid_${field}`);
  return v.toLowerCase();
}

type Row = {
  id: string; user_id: string; label: string; login_ciphertext: string; password_ciphertext: string;
  notes_ciphertext: string | null; created_at: string; updated_at: string;
};

async function publicView(r: KeyRing, row: Row, withNotes: boolean) {
  return {
    id: row.id,
    label: row.label,
    login: await decryptField(r, row.user_id, row.id, "login", row.login_ciphertext),
    notes: withNotes && row.notes_ciphertext
      ? await decryptField(r, row.user_id, row.id, "notes", row.notes_ciphertext) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadRow(db: SupabaseClient, id: string): Promise<Row> {
  const { data, error } = await db.from("facebook_accounts").select("*").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, "db_error");
  if (!data) throw new HttpError(404, "not_found"); // inclui registos de outros utilizadores (RLS)
  return data as Row;
}

async function audit(db: SupabaseClient, action: string, accountId: string | null) {
  await db.from("vault_audit").insert({ action, account_id: accountId });
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError(401, "unauthorized");

  const db = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await db.auth.getUser(jwt);
  if (userErr || !userData.user) throw new HttpError(401, "unauthorized");
  const user = userData.user;

  const { data: profile } = await db.from("profiles").select("status").eq("id", user.id).maybeSingle();
  if (!profile || profile.status !== "approved") throw new HttpError(403, "account_not_approved");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { throw new HttpError(400, "invalid_json"); }
  const r = await ring();

  switch (body.action) {
    case "list": {
      const { data, error } = await db.from("facebook_accounts").select("*").order("created_at", { ascending: false });
      if (error) throw new HttpError(500, "db_error");
      const items = await Promise.all((data as Row[]).map((row) => publicView(r, row, false)));
      return json(req, 200, { items });
    }

    case "get": {
      const row = await loadRow(db, uuid(body.id));
      return json(req, 200, { item: await publicView(r, row, true) });
    }

    case "create": {
      // request_id = id do registo -> repetições do mesmo pedido não duplicam.
      const id = uuid(body.request_id, "request_id");
      const label = str(body.label, "label", { max: 80 })!;
      const login = str(body.login, "login", { max: 254 })!;
      const password = str(body.password, "password", { max: 512 })!;
      const notes = str(body.notes, "notes", { max: 2000, required: false });

      const existing = await db.from("facebook_accounts").select("*").eq("id", id).maybeSingle();
      if (existing.data) return json(req, 200, { item: await publicView(r, existing.data as Row, true), duplicate: true });

      const { data, error } = await db.from("facebook_accounts").insert({
        id, label,
        login_ciphertext: await encryptField(r, user.id, id, "login", login),
        password_ciphertext: await encryptField(r, user.id, id, "password", password),
        notes_ciphertext: notes ? await encryptField(r, user.id, id, "notes", notes) : null,
        key_version: r.current,
      }).select("*").single();
      if (error) {
        if (error.code === "23505") throw new HttpError(409, "conflict");
        throw new HttpError(500, "db_error");
      }
      await audit(db, "create", id);
      return json(req, 201, { item: await publicView(r, data as Row, true) });
    }

    case "update": {
      const id = uuid(body.id);
      const row = await loadRow(db, id);
      const patch: Record<string, unknown> = {};
      if (body.label !== undefined) patch.label = str(body.label, "label", { max: 80 });
      if (body.login !== undefined) {
        patch.login_ciphertext = await encryptField(r, row.user_id, id, "login", str(body.login, "login", { max: 254 })!);
      }
      if (body.password !== undefined && body.password !== "") {
        patch.password_ciphertext = await encryptField(r, row.user_id, id, "password", str(body.password, "password", { max: 512 })!);
      }
      if (body.notes !== undefined) {
        const notes = str(body.notes, "notes", { max: 2000, required: false });
        patch.notes_ciphertext = notes ? await encryptField(r, row.user_id, id, "notes", notes) : null;
      }
      if (Object.keys(patch).length === 0) return json(req, 200, { item: await publicView(r, row, true) });
      // Ao reescrever um campo, re-cifra também os restantes com a chave actual.
      if (!patch.login_ciphertext) {
        patch.login_ciphertext = await encryptField(r, row.user_id, id, "login",
          await decryptField(r, row.user_id, id, "login", row.login_ciphertext));
      }
      if (!patch.password_ciphertext) {
        patch.password_ciphertext = await encryptField(r, row.user_id, id, "password",
          await decryptField(r, row.user_id, id, "password", row.password_ciphertext));
      }
      if (patch.notes_ciphertext === undefined && row.notes_ciphertext) {
        patch.notes_ciphertext = await encryptField(r, row.user_id, id, "notes",
          await decryptField(r, row.user_id, id, "notes", row.notes_ciphertext));
      }
      patch.key_version = r.current;
      const { data, error } = await db.from("facebook_accounts").update(patch).eq("id", id).select("*").single();
      if (error) throw new HttpError(500, "db_error");
      await audit(db, "update", id);
      return json(req, 200, { item: await publicView(r, data as Row, true) });
    }

    case "delete": {
      const id = uuid(body.id);
      const { data, error } = await db.from("facebook_accounts").delete().eq("id", id).select("id");
      if (error) throw new HttpError(500, "db_error");
      if (!data || data.length === 0) throw new HttpError(404, "not_found");
      await audit(db, "delete", id);
      return json(req, 200, { ok: true });
    }

    case "reveal": {
      const id = uuid(body.id);
      const accountPassword = str(body.account_password, "account_password", { max: 512 })!;

      const since = new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString();
      const { count } = await db.from("vault_audit").select("id", { count: "exact", head: true })
        .eq("action", "reveal_failed").gte("created_at", since);
      if ((count ?? 0) >= MAX_FAILED_REVEALS) throw new HttpError(429, "too_many_attempts");

      const row = await loadRow(db, id);

      // Reautenticação: verifica a palavra-passe da conta BARON CONTROL.
      const verifier = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: re, error: reErr } = await verifier.auth.signInWithPassword({ email: user.email!, password: accountPassword });
      if (reErr || !re.user || re.user.id !== user.id) {
        await audit(db, "reveal_failed", id);
        throw new HttpError(403, "reauth_failed");
      }
      await verifier.auth.signOut({ scope: "local" }); // termina apenas a sessão de verificação

      const password = await decryptField(r, row.user_id, id, "password", row.password_ciphertext);
      await audit(db, "reveal", id);
      return json(req, 200, { password });
    }

    default:
      throw new HttpError(400, "unknown_action");
  }
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    if (e instanceof HttpError) return json(req, e.status, { error: e.code });
    // Nunca incluir o corpo do pedido (pode conter credenciais) nos logs.
    console.error("vault: unexpected error", e instanceof Error ? e.name : "unknown");
    return json(req, 500, { error: "internal_error" });
  }
});
