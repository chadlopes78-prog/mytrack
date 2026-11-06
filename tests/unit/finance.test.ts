import { describe, expect, it } from "vitest";
import { computeReport, consolidateByDay, findLikelyDuplicate, mul2, parseAmount, rangeBounds, summarize } from "../../src/lib/finance";
import type { DailyReport, Investment } from "../../src/lib/types";

const inv = (usdt: number, rate = 75, loaded = true, at = "2026-11-01T10:00:00"): Investment => ({
  id: crypto.randomUUID(), user_id: "u", usdt_amount: usdt, rate, mzn_amount: mul2(usdt, rate),
  loaded_to_ads: loaded, occurred_at: new Date(at).toISOString(), note: null, created_at: "",
});
const rep = (date: string, spend: number, revenue: number, other = 0, rate = 75): DailyReport => {
  const r = computeReport({ adSpend: spend, rate, revenueMzn: revenue, otherMzn: other });
  return { id: crypto.randomUUID(), user_id: "u", report_date: date, ad_spend: spend, spend_currency: "USDT", rate,
    ad_spend_mzn: r.adSpendMzn, revenue_mzn: revenue, other_expenses_mzn: other, net_profit_mzn: r.netProfitMzn,
    roas: r.roas, note: null, created_at: "" };
};

describe("conversão USDT -> MT", () => {
  it("exemplos do enunciado", () => {
    expect(mul2(20, 75)).toBe(1500);
    expect(mul2(30, 75)).toBe(2250);
    expect(mul2(15, 75)).toBe(1125);
  });
  it("arredonda como a base de dados", () => {
    expect(mul2(0.1, 3)).toBe(0.3);
    expect(mul2(12.35, 74.5)).toBe(920.08); // 920.075 -> 920.08
    expect(mul2(1.005, 1)).toBe(1.01);
  });
});

describe("cálculo diário", () => {
  it("exemplo do enunciado: lucro 5 000 MT", () => {
    const r = computeReport({ adSpend: 40, rate: 75, revenueMzn: 8500, otherMzn: 500 });
    expect(r).toMatchObject({ adSpendMzn: 3000, netProfitMzn: 5000, outcome: "profit" });
    expect(r.roas).toBeCloseTo(2.8333, 4);
  });
  it("prejuízo e ROAS N/A", () => {
    expect(computeReport({ adSpend: 20, rate: 75, revenueMzn: 1000, otherMzn: 0 })).toMatchObject({ netProfitMzn: -500, outcome: "loss" });
    expect(computeReport({ adSpend: 0, rate: 75, revenueMzn: 300, otherMzn: 0 }).roas).toBeNull();
  });
});

describe("resumo", () => {
  it("distingue comprado, carregado e gasto", () => {
    const s = summarize([inv(20), inv(30), inv(15, 75, false)], [rep("2026-11-02", 40, 8500, 500)], null);
    expect(s).toMatchObject({ usdtBought: 65, usdtLoaded: 50, usdtInWallet: 15, mznInvested: 4875,
      adSpendUnits: 40, adSpendMzn: 3000, revenueMzn: 8500, profitMzn: 5000 });
    expect(s.balance).toMatchObject({ value: 10, reconciled: false });
  });
  it("saldo reconciliado conta só movimentos posteriores", () => {
    const s = summarize(
      [inv(100, 75, true, "2026-10-30T10:00:00"), inv(50, 75, true, "2026-11-03T10:00:00")],
      [rep("2026-10-31", 30, 0), rep("2026-11-04", 20, 0)],
      { reconciled_balance_usd: 80, reconciled_on: "2026-11-01" });
    expect(s.balance).toMatchObject({ value: 110, reconciled: true });
  });
});

describe("histórico", () => {
  it("consolida vários relatórios no mesmo dia", () => {
    const days = consolidateByDay([rep("2026-11-01", 10, 1000), rep("2026-11-01", 30, 7500, 500), rep("2026-11-02", 5, 0)]);
    expect(days.map((d) => d.date)).toEqual(["2026-11-02", "2026-11-01"]);
    expect(days[1]).toMatchObject({ adSpendMzn: 3000, revenueMzn: 8500, otherMzn: 500, profitMzn: 5000 });
    expect(days[1].reports).toHaveLength(2);
  });
  it("detecta duplicação acidental", () => {
    const list = [rep("2026-11-01", 40, 8500, 500)];
    expect(findLikelyDuplicate(list, { report_date: "2026-11-01", ad_spend: 40, revenue_mzn: 8500, other_expenses_mzn: 500 })).toBeTruthy();
    expect(findLikelyDuplicate(list, { report_date: "2026-11-01", ad_spend: 41, revenue_mzn: 8500, other_expenses_mzn: 500 })).toBeUndefined();
  });
  it("filtros de período", () => {
    const now = new Date(2026, 10, 6, 15); // sexta, 6 nov 2026
    expect(rangeBounds("today", now)).toEqual({ from: "2026-11-06", to: "2026-11-06" });
    expect(rangeBounds("7d", now)).toEqual({ from: "2026-10-31", to: "2026-11-06" });
    expect(rangeBounds("30d", now).from).toBe("2026-10-08");
    expect(rangeBounds("week", now).from).toBe("2026-11-02");
    expect(rangeBounds("month", now).from).toBe("2026-11-01");
    expect(rangeBounds("year", now).from).toBe("2026-01-01");
  });
});

describe("parseAmount", () => {
  it("aceita formatos PT e EN", () => {
    expect(parseAmount("1.500,50")).toBe(1500.5);
    expect(parseAmount("1500.5")).toBe(1500.5);
    expect(parseAmount("20,5")).toBe(20.5);
    expect(parseAmount("1,500.25")).toBe(1500.25);
    expect(parseAmount("abc")).toBeNaN();
    expect(parseAmount("-5")).toBeNaN();
  });
});

import { fmtMZN, fmtUSDT, fmtRoas } from "../../src/lib/format";
describe("formatação", () => {
  it("formato moçambicano", () => {
    expect(fmtMZN(1500)).toBe("1.500,00 MT");
    expect(fmtMZN(1234567.891)).toBe("1.234.567,89 MT");
    expect(fmtMZN(-500)).toBe("−500,00 MT");
    expect(fmtMZN(0)).toBe("0,00 MT");
    expect(fmtUSDT(20)).toBe("20 USDT");
    expect(fmtUSDT(12.5)).toBe("12,5 USDT");
    expect(fmtRoas(2.8333)).toBe("2,83×");
    expect(fmtRoas(null)).toBe("N/A");
  });
});
