import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

// Valores públicos e fixos do Supabase local (`supabase start`). Nunca usar em produção.
export const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
export const ANON_KEY = process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
export const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const MAILPIT_URL = "http://127.0.0.1:54324";
export const ADMIN_EMAIL = "chadlopesff@gmail.com";
export const PASSWORD = "Baron-Test-2026";

export const service = createClient(API_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export function anonClient(): SupabaseClient {
  return createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  try { return (await c.query(text, params)).rows as T[]; } finally { await c.end(); }
}

export const uniq = () => Math.random().toString(36).slice(2, 10);

/** Cria um utilizador confirmado pela API administrativa (como se tivesse confirmado o e-mail). */
export async function createConfirmedUser(email: string, password = PASSWORD) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return data.user!;
}

export async function signIn(email: string, password = PASSWORD): Promise<SupabaseClient> {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

export async function setStatus(userId: string, status: string) {
  await sql("update public.profiles set status = $1 where id = $2", [status, userId]);
}

/** Cria (se necessário) e autentica o administrador principal. */
export async function adminClient(): Promise<SupabaseClient> {
  const existing = await sql<{ id: string }>("select id from auth.users where email = $1", [ADMIN_EMAIL]);
  if (existing.length === 0) await createConfirmedUser(ADMIN_EMAIL);
  return signIn(ADMIN_EMAIL);
}

export async function approvedUser(prefix: string) {
  const email = `${prefix}.${uniq()}@test.baron`;
  const user = await createConfirmedUser(email);
  await setStatus(user.id, "approved");
  const client = await signIn(email);
  return { email, user, client };
}

export async function vault(client: SupabaseClient, body: Record<string, unknown>) {
  const { data: s } = await client.auth.getSession();
  const res = await fetch(`${API_URL}/functions/v1/vault`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${s.session?.access_token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
