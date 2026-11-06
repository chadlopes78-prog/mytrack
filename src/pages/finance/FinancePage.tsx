import { useMemo, useState } from "react";
import { BarChart3, Calculator, ChevronRight, Coins, Pencil, Plus, Settings2, Trash2, Wallet } from "lucide-react";
import { PageHeader } from "../../components/Layout";
import { Amount, signTone, type Tone, Button, ConfirmDialog, EmptyState, ErrorState, Input, Modal, Segmented, Skeleton, cx } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { useDeleteInvestment, useDeleteReport, useInvestments, useReports, useSettings } from "../../lib/data";
import { errorMessage } from "../../lib/errors";
import { RANGE_LABELS, consolidateByDay, inRange, rangeBounds, summarize, type DayRow, type RangeKey } from "../../lib/finance";
import { fmtDate, fmtDateTime, fmtMZN, fmtQty, fmtRate, fmtRoas, fmtUSDT, fmtWeekday } from "../../lib/format";
import type { DailyReport, Investment } from "../../lib/types";
import { InvestmentForm } from "./InvestmentForm";
import { ReportForm } from "./ReportForm";
import { SettingsModal } from "./SettingsModal";
import { TrendChart } from "./TrendChart";

export function FinancePage() {
  const inv = useInvestments();
  const rep = useReports();
  const set = useSettings();
  const [invOpen, setInvOpen] = useState(false);
  const [editInv, setEditInv] = useState<Investment | null>(null);
  const [repOpen, setRepOpen] = useState(false);
  const [editRep, setEditRep] = useState<DailyReport | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<"reports" | "investments">("reports");

  const rate = set.data?.default_rate ?? 75;
  const loading = inv.isPending || rep.isPending || set.isPending;
  const failed = inv.error || rep.error || set.error;
  const summary = useMemo(() => summarize(inv.data ?? [], rep.data ?? [], set.data ?? null), [inv.data, rep.data, set.data]);

  return (
    <div className="animate-rise">
      <PageHeader eyebrow="Financeiro" title="Visão geral"
        actions={<>
          <Button variant="outline" onClick={() => setSettingsOpen(true)} icon={<Settings2 className="h-4 w-4" />} className="hidden sm:inline-flex">Taxa {fmtRate(rate)}</Button>
          <Button variant="outline" onClick={() => { setEditInv(null); setInvOpen(true); }} icon={<Plus className="h-4 w-4" />} disabled={loading}>Adicionar investimento</Button>
          <Button onClick={() => { setEditRep(null); setRepOpen(true); }} icon={<Calculator className="h-4 w-4" />} disabled={loading}>Calcular resultados</Button>
        </>} />

      <button onClick={() => setSettingsOpen(true)} className="-mt-3 mb-3 flex min-h-[40px] items-center gap-2 text-xs font-semibold text-bone-500 sm:hidden">
        <Settings2 className="h-3.5 w-3.5" /> Taxa actual: <span className="text-gold">{fmtRate(rate)}</span>
      </button>

      {failed ? (
        <ErrorState message={errorMessage(failed)} onRetry={() => { inv.refetch(); rep.refetch(); set.refetch(); }} />
      ) : (
        <>
          <Kpis loading={loading} s={summary} onReconcile={() => setSettingsOpen(true)} />
          <Flow loading={loading} s={summary} />

          <div className="mt-8 flex items-center justify-between gap-3">
            <Segmented value={view} onChange={setView} options={[{ value: "reports", label: "Relatórios" }, { value: "investments", label: "Investimentos" }]} />
          </div>
          <div className="mt-4">
            {view === "reports"
              ? <History loading={loading} reports={rep.data ?? []} onEdit={(r) => { setEditRep(r); setRepOpen(true); }} onNew={() => { setEditRep(null); setRepOpen(true); }} />
              : <InvestmentsList loading={loading} items={inv.data ?? []} onEdit={(i) => { setEditInv(i); setInvOpen(true); }} onNew={() => { setEditInv(null); setInvOpen(true); }} />}
          </div>
        </>
      )}

      <InvestmentForm open={invOpen} onClose={() => setInvOpen(false)} defaultRate={rate} editing={editInv} />
      <ReportForm open={repOpen} onClose={() => setRepOpen(false)} defaultRate={rate} editing={editRep} reports={rep.data ?? []} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={set.data ?? null} estimate={summary.balance} />
    </div>
  );
}

function Kpis({ s, loading, onReconcile }: { s: ReturnType<typeof summarize>; loading: boolean; onReconcile: () => void }) {
  const profitTone = signTone(s.profitMzn);
  const cards: { label: string; value: string; sub?: React.ReactNode; tone?: Tone; hero?: boolean }[] = [
    { label: s.profitMzn < 0 ? "Prejuízo acumulado" : "Lucro acumulado", value: fmtMZN(s.profitMzn), tone: profitTone, hero: true,
      sub: <>ROAS global <b className="num text-bone">{fmtRoas(s.roas)}</b></> },
    { label: "Faturamento total", value: fmtMZN(s.revenueMzn), tone: "gold" },
    { label: "Total gasto em anúncios", value: fmtMZN(s.adSpendMzn), tone: s.adSpendMzn > 0 ? "loss" : "neutral", sub: <span className="num">{fmtQty(s.adSpendUnits)} USD/USDT</span> },
    { label: "Total de USDT carregados", value: fmtUSDT(s.usdtLoaded), sub: s.usdtInWallet > 0 ? <span className="num">+ {fmtUSDT(s.usdtInWallet)} em carteira</span> : <span>Comprados: <span className="num">{fmtUSDT(s.usdtBought)}</span></span> },
    { label: "Total investido", value: fmtMZN(s.mznInvested), sub: <span>Em compras de USDT</span> },
    { label: s.balance.reconciled ? "Saldo disponível" : "Saldo estimado", value: s.balance.hasData ? fmtUSDT(s.balance.value) : "—", tone: !s.balance.hasData ? "muted" : s.balance.value < 0 ? "loss" : "neutral",
      sub: s.balance.reconciled
        ? <span className="text-gain">Reconciliado a {fmtDate(s.balance.reconciledOn!)}</span>
        : <button onClick={onReconcile} className="-my-2 py-2 text-left text-gold/90 underline-offset-2 hover:underline">Estimativa · reconciliar saldo</button> },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:grid-cols-3 lg:gap-4">
      {cards.map((c, i) => (
        <div key={c.label} className={cx("card relative min-w-0 overflow-hidden p-4 sm:p-5", (c.hero || i === cards.length - 1) && "min-[380px]:col-span-2 lg:col-span-1")} style={{ animationDelay: `${i * 30}ms` }}>
          {c.hero && <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gold/10 blur-2xl" />}
          <div className="label">{c.label}</div>
          {loading ? <Skeleton className="mt-3 h-7 w-3/4" /> : (
            <div className="mt-2"><Amount value={c.value} size={c.hero ? "hero" : "lg"} tone={c.tone ?? "neutral"} /></div>
          )}
          {c.sub && !loading && <div className="mt-1.5 text-[12px] text-bone-500">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/** Mostra claramente: comprado → carregado → gasto. */
function Flow({ s, loading }: { s: ReturnType<typeof summarize>; loading: boolean }) {
  if (loading || s.usdtBought === 0) return null;
  const steps = [
    { k: "1 · Comprado em USDT", v: s.usdtBought },
    { k: "2 · Carregado em anúncios", v: s.usdtLoaded },
    { k: "3 · Gasto efectivo", v: s.adSpendUnits },
  ];
  const max = Math.max(...steps.map((x) => x.v), 1);
  return (
    <div className="card mt-4 p-4 sm:p-5">
      <div className="flex items-center gap-2"><Coins className="h-4 w-4 text-gold" /><span className="text-sm font-bold">Fluxo do dinheiro</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {steps.map((x, i) => (
          <div key={x.k}>
            <div className="flex justify-between text-xs"><span className="text-bone-500">{x.k}</span><span className="num font-semibold">{fmtQty(x.v)}</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div className={cx("h-full rounded-full transition-all", i === 2 ? "bg-loss/80" : "bg-gold/80")} style={{ width: `${(x.v / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function History({ reports, loading, onEdit, onNew }: { reports: DailyReport[]; loading: boolean; onEdit: (r: DailyReport) => void; onNew: () => void }) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<DayRow | null>(null);

  const bounds = rangeBounds(range, new Date(), { from, to });
  const filtered = useMemo(() => reports.filter((r) => inRange(r.report_date, bounds)), [reports, bounds.from, bounds.to]); // eslint-disable-line
  const days = useMemo(() => consolidateByDay(filtered), [filtered]);
  const t = useMemo(() => summarize([], filtered, null), [filtered]);

  if (loading) return <div className="card space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>;
  if (reports.length === 0) return (
    <div className="card"><EmptyState icon={<BarChart3 className="h-5 w-5" />} title="Ainda sem relatórios"
      text="Registe o gasto em anúncios e o faturamento do dia para ver lucro, ROAS e gráficos." action={<Button onClick={onNew} icon={<Calculator className="h-4 w-4" />}>Calcular resultados</Button>} /></div>
  );

  return (
    <div className="space-y-4">
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1.5">
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
            <button key={k} onClick={() => setRange(k)} className={cx("min-h-[38px] rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition",
              range === k ? "border-gold/50 bg-gold/[0.08] text-gold" : "border-white/[0.07] text-bone-500 hover:text-bone")}>{RANGE_LABELS[k]}</button>
          ))}
        </div>
      </div>
      {range === "custom" && (
        <div className="grid max-w-md grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" />
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="Até" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { k: "Faturamento", v: fmtMZN(t.revenueMzn), tone: "gold" as Tone },
          { k: "Despesas", v: fmtMZN(t.adSpendMzn + t.otherMzn), tone: "loss" as Tone },
          { k: t.profitMzn < 0 ? "Prejuízo" : "Lucro", v: fmtMZN(t.profitMzn), tone: signTone(t.profitMzn) },
          { k: "ROAS", v: fmtRoas(t.roas), tone: "neutral" as Tone },
        ].map((x) => (
          <div key={x.k} className="min-w-0 rounded-xl border border-white/[0.05] bg-ink-900/60 px-3.5 py-3">
            <div className="text-[11px] font-semibold text-bone-500">{x.k}</div>
            <div className="mt-1"><Amount value={x.v} tone={x.tone} className="font-bold" /></div>
          </div>
        ))}
      </div>

      {days.length === 0 ? (
        <div className="card"><EmptyState icon={<BarChart3 className="h-5 w-5" />} title="Sem relatórios neste período" text="Escolha outro período para ver o histórico." /></div>
      ) : (<>
        <div className="card p-4 sm:p-6">
          <div className="mb-3 text-sm font-bold">Evolução — {RANGE_LABELS[range].toLowerCase()}</div>
          <TrendChart days={days} />
        </div>

        {/* Tabela — computador */}
        <div className="card hidden overflow-hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-[0.12em] text-bone-500">
                {["Data", "Gasto", "Despesa (MT)", "Faturamento", "Outras", "Lucro líquido", "ROAS", ""].map((h, i) => (
                  <th key={i} className={cx("px-4 py-3 font-semibold", i > 0 && i < 7 && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date} onClick={() => setOpen(d)} className="cursor-pointer border-b border-white/[0.04] transition last:border-0 hover:bg-white/[0.025]">
                  <td className="px-4 py-3"><div className="font-semibold">{fmtDate(d.date)}</div>{d.reports.length > 1 && <div className="text-[11px] text-gold/80">{d.reports.length} relatórios consolidados</div>}</td>
                  <td className="num px-4 py-3 text-right text-bone-200">{fmtQty(d.adSpendUnits)}</td>
                  <td className="num px-4 py-3 text-right text-bone-200">{fmtMZN(d.adSpendMzn)}</td>
                  <td className="num px-4 py-3 text-right">{fmtMZN(d.revenueMzn)}</td>
                  <td className="num px-4 py-3 text-right text-bone-400">{fmtMZN(d.otherMzn)}</td>
                  <td className={cx("num px-4 py-3 text-right font-bold", d.profitMzn < 0 ? "text-loss" : d.profitMzn > 0 ? "text-gain" : "")}>{fmtMZN(d.profitMzn)}</td>
                  <td className="num px-4 py-3 text-right">{fmtRoas(d.roas)}</td>
                  <td className="px-2 text-bone-600"><ChevronRight className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Lista — telemóvel */}
        <div className="space-y-2 md:hidden">
          {days.map((d) => (
            <button key={d.date} onClick={() => setOpen(d)} className="card flex w-full items-center gap-2 p-4 text-left">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="flex items-center gap-2 text-sm font-semibold">{fmtDate(d.date)}{d.reports.length > 1 && <span className="rounded-full bg-gold/10 px-1.5 text-[10px] text-gold">×{d.reports.length}</span>}</span>
                  <Amount value={fmtMZN(d.profitMzn)} tone={signTone(d.profitMzn)} className="font-bold" />
                </div>
                <div className="num mt-1 flex flex-wrap gap-x-2 text-xs text-bone-500">
                  <span className="whitespace-nowrap">Fat. {fmtMZN(d.revenueMzn)}</span><span className="whitespace-nowrap">ROAS {fmtRoas(d.roas)}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-bone-600" />
            </button>
          ))}
        </div>
      </>)}

      <DayDetail day={open} onClose={() => setOpen(null)} onEdit={(r) => { setOpen(null); onEdit(r); }} />
    </div>
  );
}

function DayDetail({ day, onClose, onEdit }: { day: DayRow | null; onClose: () => void; onEdit: (r: DailyReport) => void }) {
  const del = useDeleteReport();
  const toast = useToast();
  const [confirm, setConfirm] = useState<DailyReport | null>(null);
  const [current, setCurrent] = useState<DayRow | null>(null);
  if (day && day !== current) setCurrent(day);
  const d = day ?? current;

  return (
    <>
      <Modal open={!!day} onClose={onClose} title={d ? fmtDate(d.date) : ""} subtitle={d ? `${fmtWeekday(d.date)} · ${d.reports.length} relatório${d.reports.length > 1 ? "s" : ""}` : ""} wide>
        {d && (
          <div className="space-y-3">
            {d.reports.length > 1 && (
              <div className="rounded-2xl border border-gold/20 bg-gold/[0.05] p-4 text-sm">
                <div className="label mb-2 text-gold/80">Consolidado do dia</div>
                <div className="grid grid-cols-2 gap-3 break-words sm:grid-cols-4">
                  <Stat k="Faturamento" v={fmtMZN(d.revenueMzn)} /><Stat k="Despesa pub." v={fmtMZN(d.adSpendMzn)} />
                  <Stat k={d.profitMzn < 0 ? "Prejuízo" : "Lucro"} v={fmtMZN(d.profitMzn)} tone={d.profitMzn < 0 ? "loss" : "gain"} /><Stat k="ROAS" v={fmtRoas(d.roas)} />
                </div>
              </div>
            )}
            {d.reports.map((r) => (
              <div key={r.id} className="rounded-2xl border border-white/[0.07] bg-ink-850 p-4">
                <div className="grid grid-cols-2 gap-x-3 gap-y-3 break-words text-sm sm:grid-cols-3">
                  <Stat k="Gasto em anúncios" v={`${fmtQty(r.ad_spend)} ${r.spend_currency}`} />
                  <Stat k="Taxa" v={fmtRate(r.rate)} />
                  <Stat k="Despesa publicitária" v={fmtMZN(r.ad_spend_mzn)} />
                  <Stat k="Faturamento" v={fmtMZN(r.revenue_mzn)} />
                  <Stat k="Outras despesas" v={fmtMZN(r.other_expenses_mzn)} />
                  <Stat k="ROAS" v={fmtRoas(r.roas)} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                  <div>
                    <div className="text-[11px] font-semibold text-bone-500">{r.net_profit_mzn < 0 ? "Prejuízo" : "Lucro líquido"}</div>
                    <div className={cx("num text-lg font-extrabold", r.net_profit_mzn < 0 ? "text-loss" : r.net_profit_mzn > 0 ? "text-gain" : "")}>{fmtMZN(r.net_profit_mzn)}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEdit(r)}>Editar</Button>
                    <Button size="sm" variant="ghost" className="text-loss hover:text-loss" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirm(r)} aria-label="Eliminar relatório" />
                  </div>
                </div>
                {r.note && <p className="mt-2 text-xs text-bone-500">{r.note}</p>}
                <p className="mt-2 text-[11px] text-bone-600">Registado em {fmtDateTime(r.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!confirm} title="Eliminar relatório?" loading={del.isPending}
        message={<>Este relatório de <b>{confirm && fmtDate(confirm.report_date)}</b> será eliminado permanentemente.</>}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          try { await del.mutateAsync(confirm!.id); toast.success("Relatório eliminado."); setConfirm(null); onClose(); }
          catch (e) { toast.error(errorMessage(e)); }
        }} />
    </>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: "gain" | "loss" }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-bone-500">{k}</div>
      <div className={cx("num mt-0.5 font-semibold", tone === "gain" && "text-gain", tone === "loss" && "text-loss")}>{v}</div>
    </div>
  );
}

function InvestmentsList({ items, loading, onEdit, onNew }: { items: Investment[]; loading: boolean; onEdit: (i: Investment) => void; onNew: () => void }) {
  const del = useDeleteInvestment();
  const toast = useToast();
  const [confirm, setConfirm] = useState<Investment | null>(null);

  if (loading) return <div className="card space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>;
  if (items.length === 0) return (
    <div className="card"><EmptyState icon={<Wallet className="h-5 w-5" />} title="Nenhum investimento registado"
      text="Registe cada compra de USDT. O valor em meticais é calculado automaticamente." action={<Button onClick={onNew} icon={<Plus className="h-4 w-4" />}>Adicionar investimento</Button>} /></div>
  );
  return (
    <>
      <div className="card divide-y divide-white/[0.05] overflow-hidden">
        {items.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3.5 sm:flex-nowrap sm:px-5">
            <div className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl border", i.loaded_to_ads ? "border-gold/25 bg-gold/[0.07] text-gold" : "border-white/10 bg-white/[0.03] text-bone-400")}>
              <Coins className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="num flex flex-wrap items-baseline gap-x-2 break-all text-[15px] font-bold">{fmtUSDT(i.usdt_amount)}<span className="text-xs font-semibold text-bone-500">× {fmtRate(i.rate)}</span></div>
              <div className="truncate text-xs text-bone-500">{fmtDateTime(i.occurred_at)} · {i.loaded_to_ads ? "Carregado" : "Em carteira"}{i.note ? ` · ${i.note}` : ""}</div>
            </div>
            <div className="order-last w-full pl-[52px] sm:order-none sm:w-auto sm:pl-0"><Amount value={fmtMZN(i.mzn_amount)} tone="gold" /></div>
            <div className="flex">
              <button onClick={() => onEdit(i)} className="grid h-10 w-10 place-items-center rounded-lg text-bone-500 hover:bg-white/5 hover:text-bone" aria-label="Editar"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => setConfirm(i)} className="grid h-10 w-10 place-items-center rounded-lg text-bone-500 hover:bg-loss/10 hover:text-loss" aria-label="Eliminar"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog open={!!confirm} title="Eliminar investimento?" loading={del.isPending}
        message={<>O carregamento de <b>{confirm && fmtUSDT(confirm.usdt_amount)}</b> ({confirm && fmtMZN(confirm.mzn_amount)}) será eliminado permanentemente.</>}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          try { await del.mutateAsync(confirm!.id); toast.success("Investimento eliminado."); setConfirm(null); }
          catch (e) { toast.error(errorMessage(e)); }
        }} />
    </>
  );
}
