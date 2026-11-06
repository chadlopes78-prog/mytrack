import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, Field, Input, Modal, Segmented, cx } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { useSaveReport } from "../../lib/data";
import { errorMessage } from "../../lib/errors";
import { computeReport, findLikelyDuplicate, localDate, parseAmount } from "../../lib/finance";
import { fmtMZN, fmtRoas } from "../../lib/format";
import type { DailyReport, SpendCurrency } from "../../lib/types";

const dec = (n: number) => String(n).replace(".", ",");

export function ReportForm({ open, onClose, defaultRate, editing, reports }: {
  open: boolean; onClose: () => void; defaultRate: number; editing?: DailyReport | null; reports: DailyReport[];
}) {
  const toast = useToast();
  const save = useSaveReport();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [date, setDate] = useState("");
  const [spend, setSpend] = useState("");
  const [currency, setCurrency] = useState<SpendCurrency>("USDT");
  const [rate, setRate] = useState("");
  const [revenue, setRevenue] = useState("");
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dupConfirm, setDupConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRequestId(crypto.randomUUID());
    setError(null); setDupConfirm(false);
    if (editing) {
      setDate(editing.report_date); setSpend(dec(editing.ad_spend)); setCurrency(editing.spend_currency);
      setRate(dec(editing.rate)); setRevenue(dec(editing.revenue_mzn)); setOther(editing.other_expenses_mzn ? dec(editing.other_expenses_mzn) : ""); setNote(editing.note ?? "");
    } else {
      setDate(localDate(new Date())); setSpend(""); setCurrency("USDT"); setRate(dec(defaultRate)); setRevenue(""); setOther(""); setNote("");
    }
  }, [open, editing, defaultRate]);

  const s = parseAmount(spend), r = parseAmount(rate), rv = parseAmount(revenue);
  const o = other.trim() ? parseAmount(other) : 0;
  const valid = [s, r, rv, o].every(Number.isFinite) && r > 0;
  const result = useMemo(() => (valid ? computeReport({ adSpend: s, rate: r, revenueMzn: rv, otherMzn: o }) : null), [valid, s, r, rv, o]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return;
    setError(null);
    if (!date) return setError("Indique a data do relatório.");
    if (!Number.isFinite(s)) return setError("Indique o valor gasto em anúncios (pode ser 0).");
    if (!Number.isFinite(r) || r <= 0) return setError("Indique uma taxa de conversão válida.");
    if (!Number.isFinite(rv)) return setError("Indique o faturamento total (pode ser 0).");
    if (!Number.isFinite(o)) return setError("Valor de outras despesas inválido.");
    const input = { report_date: date, ad_spend: s, spend_currency: currency, rate: r, revenue_mzn: rv, other_expenses_mzn: o, note: note.trim() || null };
    if (!dupConfirm && findLikelyDuplicate(reports, input, editing?.id)) {
      setDupConfirm(true);
      return;
    }
    try {
      await save.mutateAsync({ id: editing?.id, requestId, input });
      toast.success(editing ? "Relatório actualizado." : "Relatório guardado.");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const sameDay = !editing && reports.filter((x) => x.report_date === date).length;

  return (
    <Modal open={open} onClose={onClose} wide title={editing ? "Editar relatório" : "Calcular resultados"} subtitle="Os resultados são guardados automaticamente."
      footer={<Button form="rep-form" type="submit" size="lg" className="w-full" loading={save.isPending}>
        {dupConfirm ? "Guardar mesmo assim" : editing ? "Guardar alterações" : "Calcular e guardar"}
      </Button>}>
      <form id="rep-form" onSubmit={submit} className="grid gap-5 sm:grid-cols-[1fr_250px]" noValidate>
        <div className="space-y-4">
          <Field label="Data do relatório" hint={sameDay ? `Já existe${sameDay > 1 ? "m" : ""} ${sameDay} relatório${sameDay > 1 ? "s" : ""} neste dia — serão consolidados.` : undefined}>
            <Input type="date" value={date} max={localDate(new Date())} onChange={(e) => { setDate(e.target.value); setDupConfirm(false); }} />
          </Field>
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <Field label="Gasto em anúncios"><Input inputMode="decimal" value={spend} onChange={(e) => { setSpend(e.target.value); setDupConfirm(false); }} placeholder="0" suffix={currency} /></Field>
            <Segmented value={currency} onChange={setCurrency} options={[{ value: "USDT", label: "USDT" }, { value: "USD", label: "USD" }]} className="mb-[3px]" />
          </div>
          <Field label="Taxa de conversão" hint={`1 ${currency} = ${rate || "—"} MT`}><Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} suffix="MT" /></Field>
          <Field label="Faturamento total"><Input inputMode="decimal" value={revenue} onChange={(e) => { setRevenue(e.target.value); setDupConfirm(false); }} placeholder="0" suffix="MT" /></Field>
          <Field label="Outras despesas (opcional)"><Input inputMode="decimal" value={other} onChange={(e) => { setOther(e.target.value); setDupConfirm(false); }} placeholder="0" suffix="MT" /></Field>
          <Field label="Observação (opcional)"><Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>

        <aside className="h-fit rounded-2xl border border-white/[0.07] bg-ink-850 p-4 sm:sticky sm:top-0">
          <div className="label">Resultado</div>
          <dl className="mt-3 space-y-2.5 text-sm">
            <Row k="Faturamento" v={result ? fmtMZN(result.revenueMzn) : "—"} />
            <Row k="Despesa publicitária" v={result ? `− ${fmtMZN(result.adSpendMzn)}` : "—"} tone="loss" />
            <Row k="Outras despesas" v={result ? `− ${fmtMZN(result.otherMzn)}` : "—"} tone="loss" />
          </dl>
          <div className="my-3 h-px bg-white/[0.07]" />
          <div className="label">{result?.outcome === "loss" ? "Prejuízo" : "Lucro líquido"}</div>
          <div className={cx("num mt-1 text-2xl font-extrabold tracking-tight",
            !result ? "text-bone-500" : result.outcome === "loss" ? "text-loss" : result.outcome === "profit" ? "text-gain" : "text-bone")}>
            {result ? fmtMZN(result.netProfitMzn) : "—"}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
            <span className="text-bone-500">ROAS</span>
            <span className="num font-bold">{result ? fmtRoas(result.roas) : "—"}</span>
          </div>
        </aside>

        {(dupConfirm || error) && (
          <div className="sm:col-span-2">
            {dupConfirm && (
              <p role="alert" className="flex gap-2 rounded-xl border border-gold/30 bg-gold/[0.07] px-3.5 py-2.5 text-sm text-gold-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Já existe um relatório idêntico nesta data. Confirme para guardar um segundo relatório.
              </p>
            )}
            {error && <p role="alert" className="rounded-xl border border-loss/25 bg-loss-900/50 px-3.5 py-2.5 text-sm text-loss">{error}</p>}
          </div>
        )}
      </form>
    </Modal>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "loss" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-bone-500">{k}</dt>
      <dd className={cx("num font-semibold", tone === "loss" && v !== "—" ? "text-loss/90" : "text-bone")}>{v}</dd>
    </div>
  );
}
