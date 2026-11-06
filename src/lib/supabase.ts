import { createClient } from "@supabase/supabase-js";

const env = import.meta.env as Record<string, string | undefined>;
const pick = (...names: string[]) => names.map((n) => env[n]?.trim()).find((v) => !!v);

// Aceita os nomes do projecto (VITE_*) e os criados pela integração
// Supabase da Vercel (NEXT_PUBLIC_*).
const url = pick("VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const anonKey = pick(
  "VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
);

/** A chave secreta (service_role / sb_secret_) dá acesso total à base de dados e ignora o RLS. */
function isSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  try {
    const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

export type ConfigProblem = null | "missing" | "secret_key" | "bad_url";
export const configProblem: ConfigProblem =
  !url || !anonKey ? "missing"
  : isSecretKey(anonKey) ? "secret_key"
  : !/^https?:\/\/[^/]+/.test(url) ? "bad_url"
  : null;
export const configError = configProblem;

// Apenas a chave pública (anon/publishable). Todo o acesso é limitado por RLS no servidor.
// O navegador guarda só o token de sessão; os dados vivem exclusivamente na base de dados.
export const supabase = createClient(
  configProblem ? "http://invalid.local" : url!,
  configProblem ? "invalid" : anonKey!,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" } },
);

export const FUNCTIONS_URL = `${url?.replace(/\/$/, "")}/functions/v1`;
export const ANON_KEY = anonKey ?? "";
