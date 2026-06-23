/**
 * Small presentation helpers local to the analytics components. Kept React/DOM
 * free (mirrors lib/ui/format.ts conventions) and tiny enough not to warrant a
 * shared module.
 */

/** USD currency, 2 dp by default; sub-cent values get 4 dp so they aren't $0.00. */
export function usd(value: number, opts?: { precise?: boolean }): string {
  const precise = opts?.precise ?? (value > 0 && value < 0.01);
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: precise ? 4 : 2,
  });
}

/** Compact integer with thousands separators (e.g. 12,480). */
export function int(value: number): string {
  return Math.round(value).toLocaleString();
}

/** Compact token count (12.5k, 1.2M) for KPI cards. */
export function compact(value: number): string {
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

/** Percentage with one decimal (e.g. "62.5%"). */
export function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Short UTC day label ("Jun 3") from a YYYY-MM-DD key. */
export function dayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
