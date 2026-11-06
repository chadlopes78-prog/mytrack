import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Copy, Eye, EyeOff, Lock, Pencil, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, ErrorState, Field, Input, Modal, Skeleton } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { useVaultDelete, useVaultItem } from "../../lib/data";
import { errorMessage } from "../../lib/errors";
import { fmtDateTime } from "../../lib/format";
import { vaultApi } from "../../lib/vault";
import { AccountForm } from "./AccountForm";

const HIDE_AFTER_MS = 30_000;

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export default function AccountDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const q = useVaultItem(id);
  const del = useVaultDelete();
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // A palavra-passe revelada só existe em memória neste componente e é
  // apagada automaticamente.
  const [secret, setSecret] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [reauth, setReauth] = useState<null | "show" | "copy">(null);
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number>();

  useEffect(() => () => { window.clearTimeout(timer.current); setSecret(null); }, []);
  const armHide = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { setSecret(null); setVisible(false); }, HIDE_AFTER_MS); };

  const flash = (k: string) => { setCopied(k); setTimeout(() => setCopied(null), 1600); };

  async function doCopy(text: string, what: string) {
    if (await copyText(text)) { flash(what); toast.success(`${what} copiado.`); } else toast.error("Não foi possível copiar.");
  }

  async function onRevealed(pw: string, intent: "show" | "copy") {
    setSecret(pw); armHide();
    if (intent === "show") setVisible(true);
    else await doCopy(pw, "Palavra-passe");
  }

  if (q.isPending) return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-64 rounded-2xl" /></div>;
  if (q.error) return (
    <div className="space-y-4">
      <BackLink />
      <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
    </div>
  );
  const item = q.data!;

  return (
    <div className="mx-auto max-w-2xl animate-rise">
      <BackLink />
      <div className="card relative mt-4 overflow-hidden">
        <div className="hairline absolute inset-x-10 top-0" />
        <div className="flex items-center gap-4 border-b border-white/[0.06] p-5 sm:p-6">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#1877F2]/25 to-[#1877F2]/5 text-xl font-extrabold text-[#8AB4FF]">{item.label.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold tracking-tight">{item.label}</h1>
            <p className="text-xs text-bone-500">Criada em {fmtDateTime(item.created_at)}</p>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div>
            <div className="label mb-1.5">E-mail ou telefone</div>
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-ink-850 py-1.5 pl-3.5 pr-1.5">
              <span className="min-w-0 flex-1 truncate font-semibold">{item.login}</span>
              <Button size="sm" variant="subtle" onClick={() => doCopy(item.login, "E-mail")} icon={copied === "E-mail" ? <Check className="h-3.5 w-3.5 text-gain" /> : <Copy className="h-3.5 w-3.5" />}>Copiar e-mail</Button>
            </div>
          </div>

          <div>
            <div className="label mb-1.5">Palavra-passe</div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-ink-850 py-1.5 pl-3.5 pr-1.5">
              <span className="num min-w-0 flex-1 truncate font-mono text-[15px] font-semibold tracking-wider">
                {visible && secret ? secret : "••••••••••••"}
              </span>
              <div className="flex gap-1.5">
                {visible && secret
                  ? <Button size="sm" variant="subtle" onClick={() => setVisible(false)} icon={<EyeOff className="h-3.5 w-3.5" />}>Ocultar</Button>
                  : <Button size="sm" variant="subtle" onClick={() => (secret ? (setVisible(true), armHide()) : setReauth("show"))} icon={<Eye className="h-3.5 w-3.5" />}>Mostrar</Button>}
                <Button size="sm" variant="subtle" onClick={() => (secret ? doCopy(secret, "Palavra-passe") : setReauth("copy"))}
                  icon={copied === "Palavra-passe" ? <Check className="h-3.5 w-3.5 text-gain" /> : <Copy className="h-3.5 w-3.5" />}>Copiar</Button>
              </div>
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-bone-600"><Lock className="h-3 w-3" /> Requer confirmação da sua palavra-passe · oculta automaticamente após 30 s</p>
          </div>

          {item.notes && (
            <div>
              <div className="label mb-1.5">Observações</div>
              <p className="whitespace-pre-wrap rounded-xl border border-white/[0.07] bg-ink-850 px-3.5 py-3 text-sm text-bone-200">{item.notes}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-white/[0.06] p-5 sm:p-6">
          <Button variant="outline" className="flex-1" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>Editar</Button>
          <Button variant="ghost" className="flex-1 text-loss hover:bg-loss/10 hover:text-loss" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(true)}>Eliminar</Button>
        </div>
      </div>

      <ReauthDialog open={!!reauth} accountId={item.id} onClose={() => setReauth(null)} onSuccess={(pw) => { const i = reauth!; setReauth(null); onRevealed(pw, i); }} />
      <AccountForm open={editOpen} onClose={() => setEditOpen(false)} editing={item} onSaved={() => { setSecret(null); setVisible(false); }} />
      <ConfirmDialog open={confirm} title="Eliminar conta do cofre?" loading={del.isPending}
        message={<>As credenciais de <b>{item.label}</b> serão eliminadas permanentemente. Esta acção não pode ser anulada.</>}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          try { await del.mutateAsync(item.id); toast.success("Conta eliminada."); nav("/contas", { replace: true }); }
          catch (e) { toast.error(errorMessage(e)); }
        }} />
    </div>
  );
}

function BackLink() {
  return <Link to="/contas" className="inline-flex items-center gap-1.5 text-sm font-semibold text-bone-500 hover:text-bone"><ArrowLeft className="h-4 w-4" /> Contas Facebook</Link>;
}

function ReauthDialog({ open, accountId, onClose, onSuccess }: { open: boolean; accountId: string; onClose: () => void; onSuccess: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setPw(""); setError(null); } }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true); setError(null);
    try { const secret = await vaultApi.reveal(accountId, pw); setPw(""); onSuccess(secret); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Confirmar identidade" subtitle="Introduza a palavra-passe da sua conta BARON CONTROL."
      footer={<Button form="reauth" type="submit" size="lg" className="w-full" loading={busy} disabled={!pw}>Confirmar</Button>}>
      <form id="reauth" onSubmit={submit} className="space-y-3">
        <Field label="Palavra-passe"><Input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm text-loss">{error}</p>}
      </form>
    </Modal>
  );
}
