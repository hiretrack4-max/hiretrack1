/**
 * Client-side period maths for the Reports previews. Mirrors the backend
 * (core/reports.py periods_for / openingsRows and the reference rangeFor) so the
 * preview lines up with the downloaded file. The downloaded file remains the
 * authoritative, server-generated artefact.
 */
import type { Job, RecruitmentStatusEntry } from '@/types/api';

export type Preset = 'today' | 'this-week' | 'this-month' | 'this-year' | 'custom' | 'all';
export type Grain = 'week' | 'month' | 'year';

const DAY = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Resolve a preset (plus optional custom bounds) to an inclusive [from, to]. */
export function presetRange(preset: Preset, from?: string, to?: string): { from: Date; to: Date } {
  const now = new Date();
  const d = startOfDay(now);
  const dow = (d.getDay() + 6) % 7; // Monday-based
  switch (preset) {
    case 'today':
      return { from: d, to: new Date(+d + DAY - 1) };
    case 'this-week': {
      const s = new Date(+d - dow * DAY);
      return { from: s, to: new Date(+s + 7 * DAY - 1) };
    }
    case 'this-month':
      return {
        from: new Date(d.getFullYear(), d.getMonth(), 1),
        to: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
      };
    case 'this-year':
      return {
        from: new Date(d.getFullYear(), 0, 1),
        to: new Date(d.getFullYear(), 11, 31, 23, 59, 59),
      };
    case 'custom':
      return {
        from: from ? new Date(from) : new Date(0),
        to: to ? new Date(`${to}T23:59:59`) : new Date(8.64e15),
      };
    default: // all
      return { from: new Date(0), to: new Date(8.64e15) };
  }
}

/** Backend date_filter code for a preset (ALL/custom fall back to CUSTOM). */
export function presetToDateFilter(preset: Preset): {
  date_filter: string;
  start?: string;
  end?: string;
} {
  switch (preset) {
    case 'today':
      return { date_filter: 'TODAY' };
    case 'this-week':
      return { date_filter: 'THIS_WEEK' };
    case 'this-month':
      return { date_filter: 'THIS_MONTH' };
    case 'this-year':
      return { date_filter: 'THIS_YEAR' };
    default:
      return { date_filter: 'THIS_YEAR' }; // custom/all handled by caller
  }
}

interface Period {
  label: string;
  from: Date;
  to: Date;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ddmmyyyy(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Trailing reporting periods (12 weeks / 12 months / 5 years). */
export function periodsFor(grain: Grain): Period[] {
  const now = new Date();
  const out: Period[] = [];
  if (grain === 'week') {
    const d = startOfDay(now);
    const monday = new Date(+d - ((d.getDay() + 6) % 7) * DAY);
    for (let i = 11; i >= 0; i -= 1) {
      const from = new Date(+monday - i * 7 * DAY);
      const to = new Date(+from + 7 * DAY - 1);
      out.push({ label: `W/c ${ddmmyyyy(from)}`, from, to });
    }
  } else if (grain === 'month') {
    for (let i = 11; i >= 0; i -= 1) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const to = new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59);
      out.push({ label: `${MONTHS[from.getMonth()]} ${from.getFullYear()}`, from, to });
    }
  } else {
    for (let i = 4; i >= 0; i -= 1) {
      const y = now.getFullYear() - i;
      out.push({ label: String(y), from: new Date(y, 0, 1), to: new Date(y, 11, 31, 23, 59, 59) });
    }
  }
  return out;
}

export interface OpeningsRow {
  period: string;
  rolesPosted: number;
  openingsPosted: number;
  rolesClosed: number;
  openingsClosed: number;
  rolesOpen: number;
  openingsOpen: number;
  joined: number;
}

const openingsOf = (n: number) => Math.max(1, n || 1);

/** Compute the openings-over-time rows for a grain (reference openingsRows). */
export function openingsRows(
  jobs: Job[],
  joinedEntries: RecruitmentStatusEntry[],
  grain: Grain,
): OpeningsRow[] {
  const inRange = (iso: string | null, from: Date, to: Date) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= from.getTime() && t <= to.getTime();
  };
  return periodsFor(grain).map((p) => {
    const posted = jobs.filter((j) => inRange(j.created_at, p.from, p.to));
    const closed = jobs.filter((j) => inRange(j.closed_at, p.from, p.to));
    const openAtEnd = jobs.filter(
      (j) =>
        j.created_at &&
        new Date(j.created_at).getTime() <= p.to.getTime() &&
        (!j.closed_at || new Date(j.closed_at).getTime() > p.to.getTime()),
    );
    const joined = joinedEntries.filter((e) => inRange(e.changed_at, p.from, p.to));
    return {
      period: p.label,
      rolesPosted: posted.length,
      openingsPosted: posted.reduce((a, j) => a + openingsOf(j.number_of_openings), 0),
      rolesClosed: closed.length,
      openingsClosed: closed.reduce((a, j) => a + openingsOf(j.number_of_openings), 0),
      rolesOpen: openAtEnd.length,
      openingsOpen: openAtEnd.reduce((a, j) => a + openingsOf(j.number_of_openings), 0),
      joined: joined.length,
    };
  });
}
