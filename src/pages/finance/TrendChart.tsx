import { useEffect, useMemo, useRef, useState } from "react";
import type { DayRow } from "../../lib/finance";
import { fmtDate, fmtMZN, fmtMZNShort } from "../../lib/format";

// Paleta validada (scripts/validate_palette.js, modo escuro): o par
// verde/vermelho fica na banda 6–8 de CVD, por isso cada série tem também
// codificação secundária: despesas = barras, faturamento = linha contínua,
// lucro = linha com marcadores; legenda e rótulos directos sempre presentes.
const C = { revenue: "#E2BC63", expenses: "#F87171", profit: "#34D399" };
const H = 260, PAD = { t: 18, r: 64, b: 28, l: 48 };

export function TrendChart({ days }: { days: DayRow[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => [...days].reverse().map((d) => ({
    date: d.date, revenue: d.revenueMzn, expenses: d.adSpendMzn + d.otherMzn, profit: d.profitMzn,
  })), [days]);

  const narrow = w < 480;
  const pad = { ...PAD, r: narrow ? 16 : PAD.r };
  const iw = w - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(1, ...data.map((d) => Math.max(d.revenue, d.expenses, d.profit)));
  const min = Math.min(0, ...data.map((d) => d.profit));
  const { ticks, lo, hi } = niceTicks(min, max);
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
  const step = iw / Math.max(1, data.length);
  const x = (i: number) => pad.l + step * (i + 0.5);
  const barW = Math.max(2, Math.min(18, step * 0.45));
  const line = (k: "revenue" | "profit") => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join("");
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(iw / 72)));
  const h = hover !== null ? data[hover] : null;
  const last = data[data.length - 1];

  function onMove(clientX: number) {
    const rect = wrap.current!.getBoundingClientRect();
    const i = Math.floor((clientX - rect.left - pad.l) / step);
    setHover(i >= 0 && i < data.length ? i : null);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-bone-400">
        <Legend color={C.revenue} label="Faturamento" kind="line" />
        <Legend color={C.expenses} label="Despesas" kind="bar" />
        <Legend color={C.profit} label="Lucro" kind="dot" />
      </div>
      <div ref={wrap} className="relative touch-pan-y select-none"
        onMouseMove={(e) => onMove(e.clientX)} onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => onMove(e.touches[0].clientX)} onTouchMove={(e) => onMove(e.touches[0].clientX)}>
        <svg width={w} height={H} role="img" aria-label="Evolução diária de faturamento, despesas e lucro" className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.05)"} />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-bone-600 text-[10px]">{fmtMZNShort(t)}</text>
            </g>
          ))}
          {data.map((d, i) => i % labelEvery === 0 && (
            <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" className="fill-bone-600 text-[10px]">{shortDate(d.date)}</text>
          ))}
          {hover !== null && <rect x={pad.l + step * hover} y={pad.t} width={step} height={ih} fill="rgba(255,255,255,.03)" />}
          {data.map((d, i) => d.expenses > 0 && (
            <path key={d.date} d={roundedBar(x(i) - barW / 2, y(d.expenses), barW, y(0) - y(d.expenses), 3)} fill={C.expenses} opacity={hover === null || hover === i ? 0.85 : 0.4} />
          ))}
          {data.length > 1 && <path d={line("revenue")} fill="none" stroke={C.revenue} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {data.length > 1 && <path d={line("profit")} fill="none" stroke={C.profit} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {data.map((d, i) => (
            <g key={d.date}>
              {(data.length === 1 || hover === i) && <circle cx={x(i)} cy={y(d.revenue)} r={4} fill={C.revenue} stroke="#111113" strokeWidth={2} />}
              {(data.length <= 31 || hover === i) && <circle cx={x(i)} cy={y(d.profit)} r={hover === i ? 4.5 : 3} fill={C.profit} stroke="#111113" strokeWidth={2} />}
            </g>
          ))}
          {!narrow && last && hover === null && (<>
            <text x={x(data.length - 1) + 10} y={y(last.revenue)} dy="0.32em" className="num fill-bone-200 text-[10px] font-semibold">{fmtMZNShort(last.revenue)}</text>
            <text x={x(data.length - 1) + 10} y={y(last.profit) + (Math.abs(y(last.profit) - y(last.revenue)) < 12 ? 12 : 0)} dy="0.32em" className="num fill-bone-200 text-[10px] font-semibold">{fmtMZNShort(last.profit)}</text>
          </>)}
        </svg>
        {h && hover !== null && (
          <div className="pointer-events-none absolute top-2 z-10 w-48 rounded-xl border border-white/10 bg-ink-800/95 p-3 text-xs shadow-lift backdrop-blur"
            style={{ left: Math.min(Math.max(0, x(hover) - 96), w - 192) }}>
            <div className="mb-2 font-semibold text-bone">{fmtDate(h.date)}</div>
            <TipRow color={C.revenue} k="Faturamento" v={fmtMZN(h.revenue)} />
            <TipRow color={C.expenses} k="Despesas" v={fmtMZN(h.expenses)} />
            <TipRow color={C.profit} k={h.profit < 0 ? "Prejuízo" : "Lucro"} v={fmtMZN(h.profit)} />
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label, kind }: { color: string; label: string; kind: "line" | "bar" | "dot" }) {
  return (
    <span className="flex items-center gap-2">
      {kind === "line" && <span className="h-[2px] w-4 rounded-full" style={{ background: color }} />}
      {kind === "bar" && <span className="h-3 w-2 rounded-[3px]" style={{ background: color }} />}
      {kind === "dot" && <span className="flex items-center"><span className="h-[2px] w-2" style={{ background: color }} /><span className="h-2 w-2 rounded-full" style={{ background: color }} /><span className="h-[2px] w-2" style={{ background: color }} /></span>}
      {label}
    </span>
  );
}

function TipRow({ color, k, v }: { color: string; k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="flex items-center gap-1.5 text-bone-400"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{k}</span>
      <span className="num font-semibold text-bone">{v}</span>
    </div>
  );
}

function shortDate(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

function roundedBar(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function niceTicks(min: number, max: number) {
  const span = max - min || 1;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const stepN = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const lo = Math.floor(min / stepN) * stepN;
  const hi = Math.ceil(max / stepN) * stepN;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += stepN) ticks.push(Math.round(t));
  return { ticks, lo, hi: hi === lo ? lo + stepN : hi };
}
