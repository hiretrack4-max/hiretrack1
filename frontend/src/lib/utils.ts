import { clsx, type ClassValue } from 'clsx';

/** Merge conditional class names (thin clsx wrapper). */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Compact number formatting for KPI cards (1234 -> 1.2k). */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

/** Group a full name into initials for the avatar fallback. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Drop empty / null / undefined values from a params object so we never send
 * blank query params to DRF (which would filter on empty strings).
 */
export function cleanParams(
  params: Record<string, string | number | boolean | undefined | null>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = typeof value === 'boolean' ? String(value) : value;
  }
  return out;
}
