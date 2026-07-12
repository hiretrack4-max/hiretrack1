import { api } from './api';
import type { Paginated } from '@/types/api';

/**
 * Fetch every page of a DRF page-number-paginated list endpoint and concatenate
 * the results. Used by report previews / option lists that need the full set
 * rather than the first page of 25.
 *
 * A `cap` bounds the work so a very large table can never lock the UI — the
 * caller is expected to label the result a "preview" when the cap is hit. The
 * authoritative, unbounded output is always the server-generated export file.
 */
export async function fetchAllPages<T>(
  url: string,
  params: Record<string, string | number> = {},
  cap = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  // Guard against pathological loops: DRF returns `next: null` on the last page.
  for (let guard = 0; guard < 500; guard += 1) {
    const { data } = await api.get<Paginated<T>>(url, {
      params: { ...params, page },
    });
    out.push(...data.results);
    if (!data.next || out.length >= cap) break;
    page += 1;
  }
  return out.slice(0, cap);
}
