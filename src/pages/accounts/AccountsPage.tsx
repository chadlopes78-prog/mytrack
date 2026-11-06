import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Plus, Search, ShieldCheck } from "lucide-react";
import { PageHeader } from "../../components/Layout";
import { Button, EmptyState, ErrorState, Input, Skeleton } from "../../components/ui";
import { useVaultList } from "../../lib/data";
import { errorMessage } from "../../lib/errors";
import { fmtDate } from "../../lib/format";
import { AccountForm } from "./AccountForm";

export default function AccountsPage() {
  const q = useVaultList();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((i) => !s || i.label.toLowerCase().includes(s) || i.login.toLowerCase().includes(s));
  }, [q.data, search]);

  return (
    <div className="animate-rise">
      <PageHeader eyebrow="Cofre privado" title="Contas Facebook"
        actions={<Button onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>Adicionar conta</Button>} />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-bone-500" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar por nome ou e-mail" className="pl-10" />
        </div>
        <div className="flex items-center gap-2 text-xs text-bone-500"><ShieldCheck className="h-4 w-4 text-gain" /> Cifrado no servidor · só você tem acesso</div>
      </div>

      {q.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (q.data ?? []).length === 0 ? (
        <div className="card"><EmptyState icon={<KeyRound className="h-5 w-5" />} title="O cofre está vazio"
          text="Guarde as credenciais das suas contas Facebook com criptografia autenticada." action={<Button onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>Adicionar conta</Button>} /></div>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-bone-500">Nenhuma conta corresponde a “{search}”.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {items.map((i) => (
            <Link key={i.id} to={`/contas/${i.id}`} className="card group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-gold/25 hover:shadow-lift">
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gold/0 blur-2xl transition group-hover:bg-gold/10" />
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#1877F2]/25 to-[#1877F2]/5 text-[17px] font-extrabold text-[#8AB4FF]">
                  {i.label.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-bold">{i.label}</div>
                  <div className="truncate text-sm text-bone-400">{i.login}</div>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between text-xs text-bone-500">
                <span className="tracking-[0.3em] text-bone-600">••••••••</span>
                <span>Criada {fmtDate(i.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <AccountForm open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
