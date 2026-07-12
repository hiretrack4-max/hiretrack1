import axios from 'axios';

/**
 * Turn an unknown thrown value (usually an AxiosError wrapping a DRF error
 * body) into a single human-readable message suitable for a toast.
 *
 * DRF error bodies are one of:
 *   - a string
 *   - `{ detail: "..." }`
 *   - `{ field: ["err", ...], non_field_errors: [...] }`
 */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (typeof data === 'string' && data.trim()) return data;
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if (typeof record.detail === 'string') return record.detail;
      const parts: string[] = [];
      for (const [key, value] of Object.entries(record)) {
        const label = key === 'non_field_errors' ? '' : `${humanizeField(key)}: `;
        if (Array.isArray(value)) parts.push(`${label}${value.join(' ')}`);
        else if (typeof value === 'string') parts.push(`${label}${value}`);
      }
      if (parts.length) return parts.join(' · ');
    }
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function humanizeField(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
