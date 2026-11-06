/** Formato moçambicano: ponto nos milhares, vírgula decimal ("1.500,00"). Agrupa sempre, também com 4 dígitos. */
function group(v: number, minFrac: number, maxFrac: number): string {
  const neg = v < 0;
  const fixed = Math.abs(v).toFixed(maxFrac);
  let [int, frac = ""] = fixed.split(".");
  while (frac.length > minFrac && frac.endsWith("0")) frac = frac.slice(0, -1);
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const out = frac ? `${int},${frac}` : int;
  return neg && Number(fixed) !== 0 ? `−${out}` : out;
}
const mzn = { format: (v: number) => group(v, 2, 2) };
const qty = { format: (v: number) => group(v, 0, 2) };

/** 1500 -> "1.500,00 MT" */
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
