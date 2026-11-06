import { supabase, FUNCTIONS_URL, ANON_KEY } from "./supabase";
import { AppError, assertOnline } from "./errors";
import type { VaultItem } from "./types";

async function call<T>(body: Record<string, unknown>): Promise<T> {
  assertOnline();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AppError("unauthorized");
  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_URL}/vault`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AppError("network");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new AppError(json.error ?? "internal_error");
  return json as T;
}

export const vaultApi = {
  list: () => call<{ items: VaultItem[] }>({ action: "list" }).then((r) => r.items),
  get: (id: string) => call<{ item: VaultItem }>({ action: "get", id }).then((r) => r.item),
  create: (input: { request_id: string; label: string; login: string; password: string; notes?: string }) =>
    call<{ item: VaultItem }>({ action: "create", ...input }).then((r) => r.item),
  update: (input: { id: string; label?: string; login?: string; password?: string; notes?: string }) =>
    call<{ item: VaultItem }>({ action: "update", ...input }).then((r) => r.item),
  remove: (id: string) => call<{ ok: true }>({ action: "delete", id }),
  reveal: (id: string, accountPassword: string) =>
    call<{ password: string }>({ action: "reveal", id, account_password: accountPassword }).then((r) => r.password),
};
