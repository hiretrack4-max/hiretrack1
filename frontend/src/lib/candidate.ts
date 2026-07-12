import type { CandidateStatusValue } from '@/types/api';

/** Ordered candidate pipeline stages (mirrors backend PIPE_ORDER). */
export const PIPE_ORDER: CandidateStatusValue[] = [
  'RESUME_RECEIVED',
  'SHORTLISTED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_IN_PROGRESS',
  'INTERVIEW_COMPLETED',
  'OFFER_RELEASED',
  'JOINED',
];

export interface PipeStage {
  pct: number;
  /** CSS color for the fill. */
  color: string;
}

/** Map a candidate status to a pipeline fill percentage + colour. */
export function pipeStage(status: string): PipeStage {
  if (status === 'REJECTED') return { pct: 100, color: 'var(--red)' };
  if (status === 'ON_HOLD') return { pct: 45, color: 'var(--amber)' };
  const idx = PIPE_ORDER.indexOf(status as CandidateStatusValue);
  if (idx < 0) return { pct: 0, color: 'var(--orange)' };
  const pct = PIPE_ORDER.length > 1 ? (idx / (PIPE_ORDER.length - 1)) * 100 : 0;
  return { pct: Math.max(6, pct), color: 'var(--orange)' };
}

/**
 * parse_flags keys → the map holds the heuristic extractor's camelCase keys
 * ("email", "phone", "totalExp", "currentCompany", …). `parse_error` / `all`
 * mean the whole parse failed, so every parsed field wants verification.
 */
export function hasFlag(flags: string[] | undefined, key: string): boolean {
  if (!flags || flags.length === 0) return false;
  return flags.includes(key) || flags.includes('all') || flags.includes('parse_error');
}

const PIN_RE = /\b\d{5,6}\b/;
const STATE_RE =
  /^(karnataka|maharashtra|tamil\s*nadu|kerala|telangana|andhra\s*pradesh|gujarat|rajasthan|punjab|haryana|uttar\s*pradesh|madhya\s*pradesh|bihar|west\s*bengal|odisha|assam|jharkhand|chhattisgarh|uttarakhand|himachal\s*pradesh|goa|delhi|ncr|india)$/i;

/**
 * Best-effort "read a city from an address" for the ↻ helper. Takes the last
 * comma-separated, non-numeric, non-state segment (≤ 3 words). Deliberately
 * light — the authoritative extraction happens server-side at parse time.
 */
export function deriveLocation(address: string): string {
  if (!address) return '';
  const parts = address
    .split(',')
    .map((p) => p.replace(PIN_RE, '').trim())
    .filter(Boolean)
    .filter((p) => !STATE_RE.test(p));
  const last = parts[parts.length - 1] ?? '';
  return last.split(/\s+/).length <= 3 ? last : '';
}
