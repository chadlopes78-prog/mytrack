import { useEffect, useState } from "react";
import { Ban, CheckCircle2, PauseCircle, PlayCircle, Search, ShieldCheck, Trash2, Users, XCircle } from "lucide-react";
import { PageHeader } from "../../components/Layout";
import { Button, ConfirmDialog, EmptyState, ErrorState, Input, Segmented, Skeleton, cx } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { useAdminAction, useAdminUsers } from "../../lib/data";
import { errorMessage } from "../../lib/errors";
import { fmtDateTime } from "../../lib/format";
import type { AccountStatus, AdminUser } from "../../lib/types";

const STATUS: Record<AccountStatus, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "border-gold/30 bg-gold/10 text-gold" },
  approved: { label: "Aprovado", cls: "border-gain/30 bg-gain/10 text-gain" },
  rejected: { label: "Rejeitado", cls: "border-loss/30 bg-loss/10 text-loss" },
  suspended: { label: "Suspenso", cls: "border-white/15 bg-white/5 text-bone-400" },
};

type Filter = "all" | AccountStatus;
type Pending = { user: AdminUser; action: "approved" | "rejected" | "suspended" | "reactivate" | "remove" };

export default function AdminPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const q = useAdminUsers(debounced);
  const act = useAdminAction();
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 250); return () => clearTimeout(t); }, [search]);

  const users = (q.data ?? []).filter((u) => filter === "all" || u.status === filter);
  const counts = (q.data ?? []).reduce((m, u) => ({ ...m, [u.status]: (m[u.status] ?? 0) + 1 }), {} as Record<string, number>);

  async function run(p: Pending) {
    try {
      if (p.action === "remove") await act.mutateAsync({ target: p.user.id, remove: true });
      else await act.mutateAsync({ target: p.user.id, status: p.action === "reactivate" ? "approved" : p.action });
      toast.success({ approved: "Utilizador aprovado.", rejected: "Pedido rejeitado.", suspended: "Utilizador suspenso.", reactivate: "Utilizador reactivado.", remove: "Utilizador removido." }[p.action]);
      setPending(null);
    } catch (e) { toast.error(errorMessage(e)); }
  }

  const confirmCopy: Record<Pending["action"], { title: string; label: string; danger: boolean; msg: string }> = {
    approved: { title: "Aprovar utilizador?", label: "Aprovar", danger: false, msg: "passará a ter acesso à plataforma." },
    rejected: { title: "Rejeitar pedido?", label: "Rejeitar", danger: true, msg: "não poderá aceder à plataforma." },
    suspended: { title: "Suspender utilizador?", label: "Suspender", danger: true, msg: "perderá imediatamente o acesso. Os dados ficam guardados." },
    reactivate: { title: "Reactivar utilizador?", label: "Reactivar", danger: false, msg: "voltará a ter acesso aos seus dados." },
    remove: { title: "Remover utilizador?", label: "Remover definitivamente", danger: true, msg: "e TODOS os seus dados (financeiros e cofre) serão eliminados permanentemente." },
  };

  return (
    <div className="animate-rise">
      <PageHeader eyebrow="Administração" title="Utilizadores" />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["pending", "approved", "suspended", "rejected"] as AccountStatus[]).map((s) => (
          <div key={s} className="card px-4 py-3.5">
            <div className="label">{STATUS[s].label}s</div>
            <div className={cx("num mt-1 text-2xl font-extrabold", s === "pending" && (counts.pending ?? 0) > 0 && "text-gold")}>{q.isPending ? "—" : counts[s] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-bone-500" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar por e-mail" className="pl-10" />
        </div>
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
          <Segmented className="w-max" value={filter} onChange={setFilter} options={[
            { value: "all", label: "Todos" }, { value: "pending", label: "Pendentes" }, { value: "approved", label: "Aprovados" },
            { value: "suspended", label: "Suspensos" }, { value: "rejected", label: "Rejeitados" }]} />
        </div>
      </div>

      {q.isPending ? <div className="card space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        : q.error ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        : users.length === 0 ? <div className="card"><EmptyState icon={<Users className="h-5 w-5" />} title="Sem utilizadores" text="Nenhum utilizador corresponde aos filtros." /></div>
        : (
          <div className="card divide-y divide-white/[0.05] overflow-hidden">
            {users.map((u) => (
              <div key={u.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-all font-semibold">{u.email}</span>
                    <span className={cx("rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATUS[u.status].cls)}>{STATUS[u.status].label}</span>
                    {u.is_primary && <span className="flex items-center gap-1 rounded-full border border-gold/30 px-2 py-0.5 text-[11px] font-semibold text-gold"><ShieldCheck className="h-3 w-3" /> Admin principal</span>}
                    {!u.email_confirmed && <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-bone-500">E-mail não confirmado</span>}
                  </div>
                  <div className="mt-1 text-xs text-bone-500">
                    Registo {fmtDateTime(u.created_at)}{u.last_sign_in_at ? ` · Último acesso ${fmtDateTime(u.last_sign_in_at)}` : ""}
                  </div>
                </div>
                {!u.is_primary && (
                  <div className="flex flex-wrap gap-2">
                    {u.status === "pending" && <>
                      <Button size="sm" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => setPending({ user: u, action: "approved" })}>Aprovar</Button>
                      <Button size="sm" variant="outline" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setPending({ user: u, action: "rejected" })}>Rejeitar</Button>
                    </>}
                    {u.status === "approved" && <Button size="sm" variant="outline" icon={<PauseCircle className="h-3.5 w-3.5" />} onClick={() => setPending({ user: u, action: "suspended" })}>Suspender</Button>}
                    {(u.status === "suspended" || u.status === "rejected") && <Button size="sm" variant="outline" icon={<PlayCircle className="h-3.5 w-3.5" />} onClick={() => setPending({ user: u, action: "reactivate" })}>{u.status === "rejected" ? "Aprovar" : "Reactivar"}</Button>}
                    <Button size="sm" variant="ghost" className="text-loss hover:bg-loss/10 hover:text-loss" icon={u.status === "pending" ? <Ban className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />} onClick={() => setPending({ user: u, action: "remove" })}>Remover</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      <p className="mt-4 text-xs text-bone-600">O administrador gere contas, mas não tem acesso aos dados financeiros nem às credenciais guardadas pelos utilizadores.</p>

      <ConfirmDialog open={!!pending} loading={act.isPending}
        title={pending ? confirmCopy[pending.action].title : ""} confirmLabel={pending ? confirmCopy[pending.action].label : ""} danger={pending ? confirmCopy[pending.action].danger : true}
        message={pending && <><b>{pending.user.email}</b> {confirmCopy[pending.action].msg}</>}
        onCancel={() => setPending(null)} onConfirm={() => pending && run(pending)} />
    </div>
  );
}
