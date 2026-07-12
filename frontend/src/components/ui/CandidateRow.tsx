import { cn } from '@/lib/utils';
import { Tag } from './Tag';
import { VerifyBadge } from './VerifyBadge';

/**
 * CandidateTableHeader + CandidateRow — the refined candidate list (pitch
 * `.chead` / `.crow`). Wrap rows in a `.ctable` container:
 *
 *   <div className="ctable">
 *     <CandidateTableHeader />
 *     {items.map(c => <CandidateRow key={c.id} … />)}
 *   </div>
 */
export function CandidateTableHeader() {
  return (
    <div className="chead">
      <span>Candidate</span>
      <span className="hide">Tagged role</span>
      <span>Total exp</span>
      <span className="hide">Location</span>
      <span>Current CTC</span>
      <span />
    </div>
  );
}

export interface CandidateRowProps {
  name: string;
  email: string;
  /** Tagged role label, or null/undefined for "Untagged". */
  taggedRole?: string | null;
  /** Pre-formatted total experience, e.g. "4.4 y". */
  totalExp?: string;
  location?: string;
  /** Flag the location (or other parsed field) as needing verification. */
  verifyLocation?: boolean;
  /** Pre-formatted current CTC, e.g. "18 LPA". */
  currentCtc?: string;
  onOpen?: () => void;
  className?: string;
}

export function CandidateRow({
  name,
  email,
  taggedRole,
  totalExp,
  location,
  verifyLocation = false,
  currentCtc,
  onOpen,
  className,
}: CandidateRowProps) {
  return (
    <div className={cn('crow', className)}>
      <div className="who">
        <div className="nm">{name}</div>
        <div className="em">{email}</div>
      </div>
      <div className="hide">
        <span className="lab">Tagged</span>
        {taggedRole ? <Tag hot>{taggedRole}</Tag> : <Tag>Untagged</Tag>}
      </div>
      <div>
        <span className="lab">Total</span>
        <span className="val mono">{totalExp ?? '—'}</span>
      </div>
      <div className="hide">
        <span className="lab">City</span>
        <span className="val">
          {location || '—'} {verifyLocation && <VerifyBadge kind="verify" />}
        </span>
      </div>
      <div>
        <span className="lab">CTC</span>
        <span className="val mono">{currentCtc ?? '—'}</span>
      </div>
      <div>
        <button type="button" className="btn ghost sm" onClick={onOpen}>
          Open
        </button>
      </div>
    </div>
  );
}
