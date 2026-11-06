import { useLayoutEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Amount, Button, Field, Input, Modal, cx } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { useSaveInvestment } from "../../lib/data";
import { errorMessage } from "../../lib/errors";
import { mul2, parseAmount } from "../../lib/finance";
import { fmtMZN, toLocalInput } from "../../lib/format";
import type { Investment } from "../../lib/types";

export function InvestmentForm({ open, onClose, defaultRate, editing }: { open: boolean; onClose: () => void; defaultRate: number; editing?: Investment | null }) {
  const toast = useToast();
  const save = useSaveInvestment();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [usdt, setUsdt] = useState("");
  const [rate, setRate] = useState("");
  const [when, setWhen] = useState("");
  const [loaded, setLoaded] = useState(true);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    setRequestId(crypto.randomUUID()); // novo identificador por formulário aberto
    setError(null);
    if (editing) {
      setUsdt(String(editing.usdt_amount).replace(".", ","));
      setRate(String(editing.rate).replace(".", ","));
      setWhen(toLocalInput(editing.occurred_at));
      setLoaded(editing.loaded_to_ads);
      setNote(editing.note ?? "");
    } else {
      setUsdt(""); setRate(String(defaultRate).replace(".", ",")); setWhen(toLocalInput(new Date())); setLoaded(true); setNote("");
    }
  }, [open, editing, defaultRate]);

  const u = parseAmount(usdt);
  const r = parseAmount(rate);
  const total = useMemo(() => (Number.isFinite(u) && Number.isFinite(r) ? mul2(u, r) : null), [u, r]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return;
    setError(null);
    if (!Number.isFinite(u) || u <= 0) return setError("Indique uma quantidade de USDT válida.");
    if (!Number.isFinite(r) || r <= 0) return setError("Indique uma taxa de conversão válida.");
    if (!when) return setError("Indique a data e hora.");
    try {
      await save.mutateAsync({
        id: editing?.id, requestId,
        input: { usdt_amount: u, rate: r, loaded_to_ads: loaded, occurred_at: new Date(when).toISOString(), note: note.trim() || null },
      });
      toast.success(editing ? "Investimento actualizado." : `Investimento de ${fmtMZN(total!)} guardado.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err)); // mantém o mesmo requestId: repetir não duplica
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Editar investimento" : "Adicionar investimento"} subtitle="Cada carregamento é guardado individualmente."
      footer={<Button form="inv-form" type="submit" size="lg" className="w-full" loading={save.isPending}>{editing ? "Guardar alterações" : "Guardar investimento"}</Button>}>
      <form id="inv-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade"><Input inputMode="decimal" value={usdt} onChange={(e) => setUsdt(e.target.value)} placeholder="0" suffix="USDT" /></Field>
          <Field label="Taxa" hint={editing ? "Taxa histórica deste registo." : undefined}><Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} suffix="MT" /></Field>
        </div>

        <div className="flex min-w-0 items-center justify-between rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/[0.09] to-transparent px-4 py-3.5">
          <div>
            <div className="label">Valor em meticais</div>
            <div className="mt-1"><Amount size="lg" value={total !== null ? fmtMZN(total) : "—"} tone={total !== null ? "gold" : "muted"} /></div>
          </div>
          <div className="num hidden text-right text-xs text-bone-500 sm:block">
            {Number.isFinite(u) ? usdt : "0"} USDT <ArrowRight className="inline h-3 w-3" /> × {Number.isFinite(r) ? rate : "—"} MT
          </div>
        </div>

        <Field label="Data e hora"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>

        <div>
          <span className="label mb-1.5 block">Destino</span>
          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
            {[{ v: true, t: "Carregado na conta", d: "Já está na conta de anúncios" }, { v: false, t: "Em carteira", d: "Comprado, ainda não carregado" }].map((o) => (
              <button type="button" key={String(o.v)} onClick={() => setLoaded(o.v)} className={cx(
                "rounded-xl border px-3 py-2.5 text-left transition",
                loaded === o.v ? "border-gold/50 bg-gold/[0.06]" : "border-white/[0.07] bg-ink-850 hover:border-white/15")}>
                <div className={cx("text-[13px] font-semibold", loaded === o.v ? "text-gold" : "text-bone")}>{o.t}</div>
                <div className="mt-0.5 text-[11px] text-bone-500">{o.d}</div>
              </button>
            ))}
          </div>
        </div>

        <Field label="Observação (opcional)"><Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: conta BM principal" /></Field>
        {error && <p role="alert" className="rounded-xl border border-loss/25 bg-loss-900/50 px-3.5 py-2.5 text-sm text-loss">{error}</p>}
      </form>
    </Modal>
  );
}
