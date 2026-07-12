/**
 * CTC / salary helpers (all amounts in LPA — lakhs per annum).
 *
 * The backend stores current/expected CTC as fixed + variable decimals in LPA
 * (e.g. 16.20). HR often pastes figures in raw rupees, so the inputs auto-detect
 * the unit: a value >= 1,00,000 is treated as rupees and divided by 1e5,
 * otherwise it is already in lakhs. So 16 -> 16, 1600000 -> 16, 16.2 -> 16.2.
 */

/** Threshold above which a number is assumed to be rupees rather than lakhs. */
const RUPEES_THRESHOLD = 100000;

/** Auto-detect rupees vs lakhs and return the value normalized to LPA. */
export function normalizeToLpa(n: number): number {
  if (!Number.isFinite(n)) return NaN;
  const lpa = Math.abs(n) >= RUPEES_THRESHOLD ? n / RUPEES_THRESHOLD : n;
  // Keep at most 2 decimals; avoid binary float noise (e.g. 16.199999).
  return Math.round(lpa * 100) / 100;
}

/**
 * Parse a raw input string into a normalized LPA number.
 * Returns null when blank / non-numeric so callers can distinguish "empty".
 */
export function parseLpaInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return normalizeToLpa(n);
}

/** Trim trailing zeros from a number (JS String() already handles this). */
function trimNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Format an LPA amount as e.g. "16.2 LPA"; em dash for blank/invalid. */
export function formatLpa(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return `${trimNumber(n)} LPA`;
}

/**
 * Sum fixed + variable (each a raw input string) into a normalized LPA total.
 * A blank part counts as 0, but the total is null only when BOTH are blank —
 * mirrors the backend's current_ctc_total / expected_ctc_total logic.
 */
export function ctcTotal(fixedRaw: string, variableRaw: string): number | null {
  const fixed = parseLpaInput(fixedRaw);
  const variable = parseLpaInput(variableRaw);
  if (fixed === null && variable === null) return null;
  return Math.round(((fixed ?? 0) + (variable ?? 0)) * 100) / 100;
}

/**
 * Percentage hike from current -> expected total (1 decimal).
 * Null when either total is null or the current total is <= 0.
 */
export function hikePercent(
  currentTotal: number | null,
  expectedTotal: number | null,
): number | null {
  if (currentTotal === null || expectedTotal === null || currentTotal <= 0) return null;
  return Math.round(((expectedTotal - currentTotal) / currentTotal) * 100 * 10) / 10;
}
