import { cn } from '@/lib/utils';
import { Chip } from './Chip';

/**
 * JobCard — the approved dossier card (pitch "Variant A").
 * A filing-card with a left pipeline-depth spine (`.edge`), the job id + status
 * chip, a serif role, a mono meta line, a 2-line JD snippet, and a footer with
 * the candidate count + date.
 *
 * Decoupled from the API `Job` type on purpose so pages can pass pre-formatted
 * strings. `status` accepts a status enum value (resolved by <Chip>).
 */
export interface JobCardProps {
  /** Formatted id, e.g. "JOB-000001". */
  jobId: string;
  /** Status enum value ("OPEN" / "IN_PROGRESS" / …). */
  status: string;
  role: string;
  /** Mono meta line, e.g. "Bengaluru · 3–7 yrs · 2 openings". */
  meta?: string;
  /** JD snippet (clamped to 2 lines). */
  jd?: string;
  candidateCount?: number;
  /** Pre-formatted date string shown in the footer. */
  date?: string;
  /** Pipeline depth 0–100 (fills the left spine). */
  depth?: number;
  onClick?: () => void;
  className?: string;
}

export function JobCard({
  jobId,
  status,
  role,
  meta,
  jd,
  candidateCount,
  date,
  depth = 0,
  onClick,
  className,
}: JobCardProps) {
  const clamped = Math.max(0, Math.min(100, depth));
  return (
    <button type="button" className={cn('jA', className)} onClick={onClick}>
      <span className="edge">
        <i style={{ height: `${clamped}%` }} />
      </span>
      <div className="row1">
        <span className="jid">{jobId}</span>
        <Chip status={status} />
      </div>
      <div className="role">{role}</div>
      {meta && <div className="jmeta">{meta}</div>}
      {jd && <div className="jjd">{jd}</div>}
      <div className="jfoot">
        <span className="jcnt">
          <b>{candidateCount ?? 0}</b> candidate{candidateCount === 1 ? '' : 's'}
        </span>
        {date && <span className="jcnt">{date}</span>}
      </div>
    </button>
  );
}
