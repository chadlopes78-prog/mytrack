// Hooks de dados. Todas as chaves de cache incluem o user_id: dados de um
// utilizador nunca são servidos a outro, mesmo durante a troca de sessão.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { assertOnline, must } from "./errors";
import { vaultApi } from "./vault";
import { useAuth } from "../auth/AuthProvider";
import type { AdminUser, AccountStatus, DailyReport, Investment, UserSettings, VaultItem } from "./types";

const num = <T extends object>(row: T, keys: (keyof T)[]): T => {
  const out = { ...row };
  for (const k of keys) if (out[k] !== null && out[k] !== undefined) (out as Record<keyof T, unknown>)[k] = Number(out[k]);
  return out;
};

function useUid() {
  const { session } = useAuth();
  return session?.user.id;
}

export function useSettings() {
  const uid = useUid();
  return useQuery({
    queryKey: ["settings", uid], enabled: !!uid,
    queryFn: async () => {
      const row = must(await supabase.from("user_settings").select("*").maybeSingle()) as UserSettings | null;
      return row ? num(row, ["default_rate", "reconciled_balance_usd"]) : null;
    },
  });
}

export function useInvestments() {
  const uid = useUid();
  return useQuery({
    queryKey: ["investments", uid], enabled: !!uid,
    queryFn: async () => (must(await supabase.from("investments").select("*").order("occurred_at", { ascending: false })) as Investment[])
      .map((r) => num(r, ["usdt_amount", "rate", "mzn_amount"])),
  });
}

export function useReports() {
  const uid = useUid();
  return useQuery({
    queryKey: ["reports", uid], enabled: !!uid,
    queryFn: async () => (must(await supabase.from("daily_reports").select("*")
      .order("report_date", { ascending: false }).order("created_at", { ascending: false })) as DailyReport[])
      .map((r) => num(r, ["ad_spend", "rate", "ad_spend_mzn", "revenue_mzn", "other_expenses_mzn", "net_profit_mzn", "roas"])),
  });
}

export type InvestmentInput = Pick<Investment, "usdt_amount" | "rate" | "loaded_to_ads" | "occurred_at" | "note">;
export type ReportInput = Pick<DailyReport, "report_date" | "ad_spend" | "spend_currency" | "rate" | "revenue_mzn" | "other_expenses_mzn" | "note">;

function useInvalidate(...keys: string[]) {
  const qc = useQueryClient();
  const uid = useUid();
  return () => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k, uid] })));
}

/** Gravação idempotente: o client_request_id é gerado quando o formulário abre;
 *  repetir o mesmo pedido (duplo clique, nova tentativa após falha de rede)
 *  nunca cria um segundo registo. */
export function useSaveInvestment() {
  const invalidate = useInvalidate("investments");
  return useMutation({
    mutationFn: async ({ id, requestId, input }: { id?: string; requestId: string; input: InvestmentInput }) => {
      assertOnline();
      if (id) {
        const r = must(await supabase.from("investments").update(input).eq("id", id).select("id"));
        if (!r || r.length === 0) throw new Error("not_found");
        return;
      }
      must(await supabase.from("investments")
        .upsert({ ...input, client_request_id: requestId }, { onConflict: "user_id,client_request_id", ignoreDuplicates: true }));
    },
    onSettled: invalidate,
  });
}

export function useDeleteInvestment() {
  const invalidate = useInvalidate("investments");
  return useMutation({
    mutationFn: async (id: string) => { assertOnline(); must(await supabase.from("investments").delete().eq("id", id)); },
    onSettled: invalidate,
  });
}

export function useSaveReport() {
  const invalidate = useInvalidate("reports");
  return useMutation({
    mutationFn: async ({ id, requestId, input }: { id?: string; requestId: string; input: ReportInput }) => {
      assertOnline();
      if (id) {
        const r = must(await supabase.from("daily_reports").update(input).eq("id", id).select("id"));
        if (!r || r.length === 0) throw new Error("not_found");
        return;
      }
      must(await supabase.from("daily_reports")
        .upsert({ ...input, client_request_id: requestId }, { onConflict: "user_id,client_request_id", ignoreDuplicates: true }));
    },
    onSettled: invalidate,
  });
}

export function useDeleteReport() {
  const invalidate = useInvalidate("reports");
  return useMutation({
    mutationFn: async (id: string) => { assertOnline(); must(await supabase.from("daily_reports").delete().eq("id", id)); },
    onSettled: invalidate,
  });
}

export function useSaveSettings() {
  const invalidate = useInvalidate("settings");
  const uid = useUid();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<UserSettings, "default_rate" | "reconciled_balance_usd" | "reconciled_on">>) => {
      assertOnline();
      const r = must(await supabase.from("user_settings").update(patch).eq("user_id", uid!).select("user_id"));
      if (!r || r.length === 0) must(await supabase.from("user_settings").insert(patch));
    },
    onSettled: invalidate,
  });
}

// ---------- Cofre ----------
export function useVaultList() {
  const uid = useUid();
  return useQuery({ queryKey: ["vault", uid], enabled: !!uid, queryFn: vaultApi.list });
}
export function useVaultItem(id: string | undefined) {
  const uid = useUid();
  return useQuery({ queryKey: ["vault", uid, id], enabled: !!uid && !!id, queryFn: () => vaultApi.get(id!), retry: false });
}
export function useVaultSave() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (v: { id?: string; requestId: string; label: string; login: string; password: string; notes: string }): Promise<VaultItem> => {
      if (v.id) return vaultApi.update({ id: v.id, label: v.label, login: v.login, password: v.password || undefined, notes: v.notes });
      return vaultApi.create({ request_id: v.requestId, label: v.label, login: v.login, password: v.password, notes: v.notes || undefined });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["vault", uid] }),
  });
}
export function useVaultDelete() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (id: string) => vaultApi.remove(id),
    onSettled: () => qc.invalidateQueries({ queryKey: ["vault", uid] }),
  });
}

// ---------- Administração ----------
export function useAdminUsers(search: string) {
  const uid = useUid();
  return useQuery({
    queryKey: ["admin_users", uid, search], enabled: !!uid,
    queryFn: async () => must(await supabase.rpc("admin_list_users", { search: search || null })) as AdminUser[],
    placeholderData: (prev) => prev,
  });
}
export function useAdminAction() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (a: { target: string; status?: AccountStatus; remove?: boolean }) => {
      assertOnline();
      if (a.remove) must(await supabase.rpc("admin_delete_user", { target: a.target }));
      else must(await supabase.rpc("admin_set_status", { target: a.target, new_status: a.status }));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin_users", uid] }),
  });
}

/** Verifica no servidor (não na cache) se já existe um relatório idêntico. */
export async function hasDuplicateReport(input: ReportInput, excludeId?: string): Promise<boolean> {
  let q = supabase.from("daily_reports").select("id", { count: "exact", head: true })
    .eq("report_date", input.report_date).eq("ad_spend", input.ad_spend)
    .eq("revenue_mzn", input.revenue_mzn).eq("other_expenses_mzn", input.other_expenses_mzn);
  if (excludeId) q = q.neq("id", excludeId);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
