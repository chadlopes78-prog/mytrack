import { useEffect, useState, type FormEvent } from "react";
import { Button, Field, Input, Modal } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { useSaveSettings } from "../../lib/data";
import { errorMessage } from "../../lib/errors";
import { localDate, parseAmount, type BalanceEstimate } from "../../lib/finance";
import { fmtUSDT } from "../../lib/format";
import type { UserSettings } from "../../lib/types";

export function SettingsModal({ open, onClose, settings, estimate }: { open: boolean; onClose: () => void; settings: UserSettings | null; estimate: BalanceEstimate }) {
  const save = useSaveSettings();
  const toast = useToast();
  const [rate, setRate] = useState("");
  const [bal, setBal] = useState("");
  const [on, setOn] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRate(String(settings?.default_rate ?? 75).replace(".", ","));
    setBal(settings?.reconciled_balance_usd != null ? String(settings.reconciled_balance_usd).replace(".", ",") : "");
    setOn(settings?.reconciled_on ?? localDate(new Date()));
  }, [open, settings]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const r = parseAmount(rate);
    if (!Number.isFinite(r) || r <= 0) return setError("Taxa inválida.");
    const b = bal.trim() ? parseAmount(bal) : null;
    if (b !== null && !Number.isFinite(b)) return setError("Saldo inválido.");
    if (b !== null && !on) return setError("Indique a data do saldo verificado.");
    try {
      await save.mutateAsync({ default_rate: r, reconciled_balance_usd: b, reconciled_on: b === null ? null : on });
      toast.success("Definições guardadas.");
      onClose();
    } catch (err) { setError(errorMessage(err)); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Taxa e saldo" subtitle="Alterar a taxa afecta apenas novos registos."
      footer={<Button form="set-form" type="submit" size="lg" className="w-full" loading={save.isPending}>Guardar</Button>}>
      <form id="set-form" onSubmit={submit} className="space-y-5">
        <Field label="Taxa de conversão para novos registos" hint="Os registos anteriores mantêm a taxa com que foram guardados.">
          <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} suffix="MT / USDT" />
        </Field>
        <div className="rounded-2xl border border-white/[0.07] bg-ink-850 p-4">
          <div className="text-sm font-bold">Reconciliar saldo da conta de anúncios</div>
          <p className="mt-1 text-xs leading-relaxed text-bone-500">
            Sem reconciliação, o saldo é uma <b className="text-bone-300">estimativa</b> (carregado − gasto: {estimate.reconciled ? "—" : fmtUSDT(estimate.value)}) que não conhece saldos
            anteriores nem gastos não registados. Introduza o saldo real que vê no Gestor de Anúncios numa data: o sistema passa a somar apenas carregamentos e gastos posteriores.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Saldo real"><Input inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value)} placeholder="Vazio = estimar" suffix="USD" /></Field>
            <Field label="Verificado em"><Input type="date" value={on} max={localDate(new Date())} onChange={(e) => setOn(e.target.value)} /></Field>
          </div>
          <p className="mt-2 text-[11px] text-bone-600">Inclua no saldo os gastos do próprio dia; relatórios dessa data não são subtraídos de novo.</p>
        </div>
        {error && <p role="alert" className="text-sm text-loss">{error}</p>}
      </form>
    </Modal>
  );
}
