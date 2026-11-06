const mzn = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 1500 -> "1 500,00 MT" (pt-PT usa espaço como separador de milhares). */
export const fmtMZN = (v: number) => `${mzn.format(v)} MT`;
export const fmtMZNShort = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${qty.format(v / 1_000_000)}M`;
  if (a >= 10_000) return `${qty.format(Math.round(v / 1000))}k`;
  return qty.format(Math.round(v));
};
export const fmtQty = (v: number) => qty.format(v);
export const fmtUSDT = (v: number) => `${qty.format(v)} USDT`;
export const fmtRate = (v: number) => `${qty.format(v)} MT`;
export const fmtRoas = (v: number | null) => (v === null ? "N/A" : `${v.toFixed(2).replace(".", ",")}×`);

export function fmtDate(d: string) {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}
export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function fmtWeekday(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("pt-PT", { weekday: "long" });
}
/** Valor para <input type="datetime-local"> em hora local. */
export function toLocalInput(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
