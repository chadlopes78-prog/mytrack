import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configError = !url || !anonKey
  ? "Configuração em falta: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY."
  : null;

// Apenas a chave pública (anon). Todo o acesso é limitado por RLS no servidor.
// A sessão de autenticação fica no armazenamento do navegador (só o token);
// os dados vivem exclusivamente na base de dados.
export const supabase = createClient(url ?? "http://invalid.local", anonKey ?? "invalid", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
});

export const FUNCTIONS_URL = `${url}/functions/v1`;
export const ANON_KEY = anonKey ?? "";
