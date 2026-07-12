import { format, parseISO } from 'date-fns';

/** Format an ISO date (YYYY-MM-DD) or datetime as a friendly date. */
export function formatDate(value?: string | null): string {
  if (!value) return '—';
  try {
    return format(parseISO(value), 'MMM d, yyyy');
  } catch {
    return value;
  }
}

/** Format an ISO datetime with time (e.g. "Jul 9, 2026 · 3:45 PM"). */
export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  try {
    return format(parseISO(value), "MMM d, yyyy '·' h:mm a");
  } catch {
    return value;
  }
}

/** Format a HH:MM(:SS) time string to a friendly 12h time. */
export function formatTime(value?: string | null): string {
  if (!value) return '—';
  try {
    return format(parseISO(`1970-01-01T${value}`), 'h:mm a');
  } catch {
    return value;
  }
}

/** Format a decimal-string / number money value with a currency code. */
export function formatMoney(
  value: string | number | null | undefined,
  currency = 'INR',
): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (Number.isNaN(num)) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(num);
  } catch {
    return `${currency} ${num.toLocaleString()}`;
  }
}

/** Render a salary range ("₹12L – ₹18L" style) from min/max decimal strings. */
export function formatSalaryRange(
  min: string | null,
  max: string | null,
  currency = 'INR',
): string {
  if (!min && !max) return '—';
  if (min && max) return `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`;
  if (min) return `From ${formatMoney(min, currency)}`;
  return `Up to ${formatMoney(max, currency)}`;
}

/** Render an experience range in years ("3 – 5 yrs"). */
export function formatExperience(min?: string | null, max?: string | null): string {
  const clean = (v?: string | null) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number.parseFloat(v);
    if (Number.isNaN(n)) return null;
    return n % 1 === 0 ? String(n) : String(n);
  };
  const lo = clean(min);
  const hi = clean(max);
  if (lo === null && hi === null) return '—';
  if (lo !== null && hi !== null) return `${lo} – ${hi} yrs`;
  if (lo !== null) return `${lo}+ yrs`;
  return `Up to ${hi} yrs`;
}

/** Format a single years value ("4.5 yrs"). */
export function formatYears(value?: string | null): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return '—';
  return `${n} ${n === 1 ? 'yr' : 'yrs'}`;
}
