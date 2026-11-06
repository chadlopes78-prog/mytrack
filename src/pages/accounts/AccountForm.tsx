import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Button, Field, Input, Modal } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { useVaultSave } from "../../lib/data";
import { errorMessage } from "../../lib/errors";
import type { VaultItem } from "../../lib/types";

export function AccountForm({ open, onClose, editing, onSaved }: { open: boolean; onClose: () => void; editing?: VaultItem | null; onSaved?: (v: VaultItem) => void }) {
  const save = useVaultSave();
  const toast = useToast();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [label, setLabel] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRequestId(crypto.randomUUID());
    setError(null); setShow(false); setPassword("");
    setLabel(editing?.label ?? ""); setLogin(editing?.login ?? ""); setNotes(editing?.notes ?? "");
  }, [open, editing]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return;
    setError(null);
    if (!label.trim()) return setError("Indique um nome para a conta.");
    if (!login.trim()) return setError("Indique o e-mail ou número de telefone.");
    if (!editing && !password) return setError("Indique a palavra-passe.");
    try {
      const v = await save.mutateAsync({ id: editing?.id, requestId, label: label.trim(), login: login.trim(), password, notes: notes.trim() });
      toast.success(editing ? "Conta actualizada." : "Conta guardada no cofre.");
      onSaved?.(v);
      onClose();
    } catch (err) { setError(errorMessage(err)); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Editar conta" : "Adicionar conta"} subtitle="Credenciais cifradas com AES-256-GCM antes de serem guardadas."
      footer={<Button form="acc-form" type="submit" size="lg" className="w-full" loading={save.isPending} icon={<Lock className="h-4 w-4" />}>{editing ? "Guardar alterações" : "Guardar no cofre"}</Button>}>
      <form id="acc-form" onSubmit={submit} className="space-y-4" noValidate autoComplete="off">
        <Field label="Nome da conta"><Input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Facebook Principal" /></Field>
        <Field label="E-mail ou telefone"><Input value={login} maxLength={254} onChange={(e) => setLogin(e.target.value)} placeholder="exemplo@email.com" autoComplete="off" /></Field>
        <Field label="Palavra-passe" hint={editing ? "Deixe vazio para manter a palavra-passe actual." : undefined}>
          <div className="relative">
            <Input type={show ? "text" : "password"} value={password} maxLength={512} onChange={(e) => setPassword(e.target.value)} className="pr-11" autoComplete="new-password" placeholder={editing ? "••••••••" : ""} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 px-3.5 text-bone-500 hover:text-bone" aria-label={show ? "Ocultar" : "Mostrar"}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field label="Observações (opcional)">
          <textarea className="input min-h-[88px] resize-y" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <p role="alert" className="rounded-xl border border-loss/25 bg-loss-900/50 px-3.5 py-2.5 text-sm text-loss">{error}</p>}
      </form>
    </Modal>
  );
}
