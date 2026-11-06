// Cálculos financeiros. Toda a aritmética monetária é feita em cêntimos
// inteiros para evitar erros de vírgula flutuante, com o mesmo arredondamento
// que a base de dados (round(x, 2)).
import type { DailyReport, Investment, UserSettings } from "./types";

export const cents = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100);
export const fromCents = (c: number) => c / 100;
/** round(a * b, 2) — igual ao Postgres numeric round. */
export const mul2 = (a: number, b: number) => fromCents(Math.round((Number(a) * Number(b) + Number.EPSILON) * 100 + 1e-9));

export function adSpendMzn(adSpend: number, rate: number): number {
  return mul2(adSpend, rate);
}

export interface ReportResult {
  adSpendMzn: number;
  revenueMzn: number;
  otherMzn: number;
  netProfitMzn: number;
  roas: number | null;
  outcome: "profit" | "loss" | "breakeven";
}

/** Lucro líquido = faturamento − despesa publicitária − outras despesas. ROAS = faturamento ÷ despesa publicitária. */
export function computeReport(i: { adSpend: number; rate: number; revenueMzn: number; otherMzn: number }): ReportResult {
  const spend = adSpendMzn(i.adSpend, i.rate);
  const net = fromCents(cents(i.revenueMzn) - cents(spend) - cents(i.otherMzn));
  const roas = cents(spend) > 0 ? Math.round((i.revenueMzn / spend) * 10000) / 10000 : null;
  return {
    adSpendMzn: spend,
    revenueMzn: i.revenueMzn,
    otherMzn: i.otherMzn,
    netProfitMzn: net,
    roas,
    outcome: net > 0 ? "profit" : net < 0 ? "loss" : "breakeven",
  };
}

export interface FinanceSummary {
  usdtBought: number;      // 1. USDT comprados (todos os registos)
  usdtLoaded: number;      // 2. USDT carregados em contas de anúncios
  usdtInWallet: number;    //    comprados mas ainda não carregados
  mznInvested: number;     // total pago em meticais pelos USDT
  adSpendUnits: number;    // 3. gasto efectivo em anúncios (USD/USDT)
  adSpendMzn: number;
  revenueMzn: number;
  otherMzn: number;
  profitMzn: number;
  roas: number | null;
  balance: BalanceEstimate;
}

export interface BalanceEstimate {
  value: number;           // USD/USDT disponível estimado na conta de anúncios
  reconciled: boolean;     // true = parte de um saldo real verificado
  reconciledOn: string | null;
  hasData: boolean;
}

/** Data local (YYYY-MM-DD) de um timestamp. */
export function localDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function summarize(
  investments: Investment[], reports: DailyReport[], settings: Pick<UserSettings, "reconciled_balance_usd" | "reconciled_on"> | null,
): FinanceSummary {
  let bought = 0, loaded = 0, mzn = 0;
  for (const i of investments) {
    bought += cents(i.usdt_amount);
    mzn += cents(i.mzn_amount);
    if (i.loaded_to_ads) loaded += cents(i.usdt_amount);
  }
  let spendU = 0, spendM = 0, rev = 0, other = 0, profit = 0;
  for (const r of reports) {
    spendU += cents(r.ad_spend);
    spendM += cents(r.ad_spend_mzn);
    rev += cents(r.revenue_mzn);
    other += cents(r.other_expenses_mzn);
    profit += cents(r.net_profit_mzn);
  }

  // Saldo: se existe um saldo real verificado numa data, parte dele e soma
  // apenas movimentos posteriores. Caso contrário é uma estimativa
  // (carregado − gasto), que ignora saldos anteriores ao primeiro registo.
  let balance: BalanceEstimate;
  const recOn = settings?.reconciled_on ?? null;
  if (settings && settings.reconciled_balance_usd !== null && recOn) {
    let v = cents(settings.reconciled_balance_usd);
    for (const i of investments) if (i.loaded_to_ads && localDate(i.occurred_at) > recOn) v += cents(i.usdt_amount);
    for (const r of reports) if (r.report_date > recOn) v -= cents(r.ad_spend);
    balance = { value: fromCents(v), reconciled: true, reconciledOn: recOn, hasData: true };
  } else {
    balance = { value: fromCents(loaded - spendU), reconciled: false, reconciledOn: null, hasData: investments.length + reports.length > 0 };
  }

  return {
    usdtBought: fromCents(bought),
    usdtLoaded: fromCents(loaded),
    usdtInWallet: fromCents(bought - loaded),
    mznInvested: fromCents(mzn),
    adSpendUnits: fromCents(spendU),
    adSpendMzn: fromCents(spendM),
    revenueMzn: fromCents(rev),
    otherMzn: fromCents(other),
    profitMzn: fromCents(profit),
    roas: spendM > 0 ? Math.round((rev / spendM) * 10000) / 10000 : null,
    balance,
  };
}

export interface DayRow {
  date: string;
  reports: DailyReport[];
  adSpendUnits: number;
  adSpendMzn: number;
  revenueMzn: number;
  otherMzn: number;
  profitMzn: number;
  roas: number | null;
}

/** Consolida vários relatórios do mesmo dia numa linha diária (ordem decrescente). */
export function consolidateByDay(reports: DailyReport[]): DayRow[] {
  const map = new Map<string, DailyReport[]>();
  for (const r of reports) {
    const list = map.get(r.report_date) ?? [];
    list.push(r);
    map.set(r.report_date, list);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, list]) => {
      let u = 0, s = 0, rv = 0, o = 0, p = 0;
      for (const r of list) {
        u += cents(r.ad_spend); s += cents(r.ad_spend_mzn); rv += cents(r.revenue_mzn);
        o += cents(r.other_expenses_mzn); p += cents(r.net_profit_mzn);
      }
      return {
        date, reports: list,
        adSpendUnits: fromCents(u), adSpendMzn: fromCents(s), revenueMzn: fromCents(rv),
        otherMzn: fromCents(o), profitMzn: fromCents(p),
        roas: s > 0 ? Math.round((rv / s) * 10000) / 10000 : null,
      };
    });
}

export type RangeKey = "all" | "today" | "7d" | "30d" | "week" | "month" | "year" | "custom";

export const RANGE_LABELS: Record<RangeKey, string> = {
  all: "Tudo", today: "Hoje", "7d": "7 dias", "30d": "30 dias",
  week: "Esta semana", month: "Este mês", year: "Este ano", custom: "Personalizado",
};

function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

/** Intervalo inclusivo [from, to] em datas locais YYYY-MM-DD; null = sem limite. */
export function rangeBounds(key: RangeKey, now = new Date(), custom?: { from?: string; to?: string }): { from: string | null; to: string | null } {
  const today = localDate(now);
  switch (key) {
    case "all": return { from: null, to: null };
    case "today": return { from: today, to: today };
    case "7d": return { from: localDate(addDays(now, -6)), to: today };
    case "30d": return { from: localDate(addDays(now, -29)), to: today };
    case "week": { const dow = (now.getDay() + 6) % 7; return { from: localDate(addDays(now, -dow)), to: today }; } // semana começa à segunda
    case "month": return { from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case "year": return { from: `${now.getFullYear()}-01-01`, to: today };
    case "custom": return { from: custom?.from || null, to: custom?.to || null };
  }
}

export function inRange(date: string, b: { from: string | null; to: string | null }) {
  return (!b.from || date >= b.from) && (!b.to || date <= b.to);
}

/** Possível duplicado: mesmo dia e mesmos valores de um relatório existente. */
export function findLikelyDuplicate(
  reports: DailyReport[], candidate: { report_date: string; ad_spend: number; revenue_mzn: number; other_expenses_mzn: number }, excludeId?: string,
): DailyReport | undefined {
  return reports.find((r) => r.id !== excludeId && r.report_date === candidate.report_date
    && cents(r.ad_spend) === cents(candidate.ad_spend)
    && cents(r.revenue_mzn) === cents(candidate.revenue_mzn)
    && cents(r.other_expenses_mzn) === cents(candidate.other_expenses_mzn));
}

/** Converte texto introduzido ("1.500,50", "1500.5", "20") em número; NaN se inválido. */
export function parseAmount(input: string): number {
  const s = input.trim().replace(/\s/g, "");
  if (!s) return NaN;
  let norm = s;
  if (s.includes(",") && s.includes(".")) {
    norm = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    norm = s.replace(",", ".");
  }
  if (!/^\d+(\.\d+)?$/.test(norm)) return NaN;
  return Number(norm);
}
