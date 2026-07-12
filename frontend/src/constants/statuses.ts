/**
 * Single source of truth for status -> label + colour, shared by StatusPill
 * and the dashboard charts. Values mirror the Django TextChoices exactly
 * (see backend/core/models.py).
 */

export interface StatusMeta {
  label: string;
  /** Tailwind text colour class for the dot / pill text. */
  color: string; // hex, used by charts
  /** Background tint class + text class for the pill. */
  pill: string;
}

/** Ordered candidate pipeline stages (Module 5 / dashboard pipeline order). */
export const CANDIDATE_STATUS_ORDER = [
  'RESUME_RECEIVED',
  'SHORTLISTED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_IN_PROGRESS',
  'INTERVIEW_COMPLETED',
  'OFFER_RELEASED',
  'JOINED',
  'REJECTED',
  'ON_HOLD',
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUS_ORDER)[number];

export const CANDIDATE_STATUS: Record<string, StatusMeta> = {
  RESUME_RECEIVED: {
    label: 'Resume Received',
    color: '#7C8DB5',
    pill: 'bg-status-received/12 text-status-received',
  },
  SHORTLISTED: {
    label: 'Shortlisted',
    color: '#4F8CFF',
    pill: 'bg-status-shortlisted/12 text-status-shortlisted',
  },
  INTERVIEW_SCHEDULED: {
    label: 'Interview Scheduled',
    color: '#F97316',
    pill: 'bg-status-scheduled/12 text-status-scheduled',
  },
  INTERVIEW_IN_PROGRESS: {
    label: 'Interview In Progress',
    color: '#C2410C',
    pill: 'bg-status-inprogress/12 text-status-inprogress',
  },
  INTERVIEW_COMPLETED: {
    label: 'Interview Completed',
    color: '#16B8C4',
    pill: 'bg-status-completed/12 text-status-completed',
  },
  OFFER_RELEASED: {
    label: 'Offer Released',
    color: '#FF6B3D',
    pill: 'bg-status-offer/12 text-status-offer',
  },
  JOINED: {
    label: 'Joined',
    color: '#22C55E',
    pill: 'bg-status-joined/12 text-status-joined',
  },
  REJECTED: {
    label: 'Rejected',
    color: '#F43F5E',
    pill: 'bg-status-rejected/12 text-status-rejected',
  },
  ON_HOLD: {
    label: 'On Hold',
    color: '#F59E0B',
    pill: 'bg-status-onhold/12 text-status-onhold',
  },
};

/** Job statuses (Module 6). */
export const JOB_STATUS: Record<string, StatusMeta> = {
  OPEN: { label: 'Open', color: '#22C55E', pill: 'bg-job-open/12 text-job-open' },
  IN_PROGRESS: {
    label: 'In Progress',
    color: '#4F8CFF',
    pill: 'bg-job-progress/12 text-job-progress',
  },
  CLOSED: { label: 'Closed', color: '#8A90A6', pill: 'bg-job-closed/14 text-job-closed' },
  ON_HOLD: { label: 'On Hold', color: '#F59E0B', pill: 'bg-job-hold/14 text-job-hold' },
};

/** Candidate-job mapping statuses (Module 4) — reused by StatusPill. */
export const MAPPING_STATUS: Record<string, StatusMeta> = {
  APPLIED: { label: 'Applied', color: '#7C8DB5', pill: 'bg-status-received/12 text-status-received' },
  UNDER_REVIEW: {
    label: 'Under Review',
    color: '#4F8CFF',
    pill: 'bg-status-shortlisted/12 text-status-shortlisted',
  },
  SHORTLISTED: {
    label: 'Shortlisted',
    color: '#F97316',
    pill: 'bg-status-scheduled/12 text-status-scheduled',
  },
  INTERVIEWING: {
    label: 'Interviewing',
    color: '#C2410C',
    pill: 'bg-status-inprogress/12 text-status-inprogress',
  },
  OFFERED: { label: 'Offered', color: '#FF6B3D', pill: 'bg-status-offer/12 text-status-offer' },
  HIRED: { label: 'Hired', color: '#22C55E', pill: 'bg-status-joined/12 text-status-joined' },
  REJECTED: { label: 'Rejected', color: '#F43F5E', pill: 'bg-status-rejected/12 text-status-rejected' },
  ON_HOLD: { label: 'On Hold', color: '#F59E0B', pill: 'bg-status-onhold/12 text-status-onhold' },
};

/** Resolve any known status to its metadata, with a neutral fallback. */
export function resolveStatus(value: string): StatusMeta {
  return (
    CANDIDATE_STATUS[value] ??
    JOB_STATUS[value] ??
    MAPPING_STATUS[value] ?? {
      label: value
        .toLowerCase()
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      color: '#8A90A6',
      pill: 'bg-muted/12 text-muted',
    }
  );
}
