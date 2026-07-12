/**
 * Dropdown option lists mirroring the Django TextChoices in
 * backend/core/models.py, plus the Module 8 report column registry
 * (backend/core/reports.py COLUMN_REGISTRY). Single source of truth for the
 * feature forms so labels/values never drift from the backend.
 */
import type { SelectOption } from '@/components/ui';
import { CANDIDATE_STATUS_ORDER } from '@/constants/statuses';
import { CANDIDATE_STATUS } from '@/constants/statuses';

export const JOB_STATUS_OPTIONS: SelectOption[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'ON_HOLD', label: 'On Hold' },
];

export const EMPLOYMENT_TYPE_OPTIONS: SelectOption[] = [
  { value: 'FULL_TIME', label: 'Full Time' },
  { value: 'PART_TIME', label: 'Part Time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
  { value: 'TEMPORARY', label: 'Temporary' },
];

/** Ordered candidate pipeline statuses as <Select> options. */
export const CANDIDATE_STATUS_OPTIONS: SelectOption[] = CANDIDATE_STATUS_ORDER.map(
  (value) => ({ value, label: CANDIDATE_STATUS[value].label }),
);

export const MAPPING_STATUS_OPTIONS: SelectOption[] = [
  { value: 'APPLIED', label: 'Applied' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'SHORTLISTED', label: 'Shortlisted' },
  { value: 'INTERVIEWING', label: 'Interviewing' },
  { value: 'OFFERED', label: 'Offered' },
  { value: 'HIRED', label: 'Hired' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ON_HOLD', label: 'On Hold' },
];

export const INTERVIEW_RESULT_OPTIONS: SelectOption[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'PASSED', label: 'Passed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'ON_HOLD', label: 'On Hold' },
];

export const OFFER_STATUS_OPTIONS: SelectOption[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'RELEASED', label: 'Released' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'REVOKED', label: 'Revoked' },
];

export const SKILL_TYPE_LABEL: Record<string, string> = {
  SKILL: 'Skill',
  TECHNOLOGY: 'Technology',
  CERTIFICATION: 'Certification',
};

// --- Module 8: report controls -------------------------------------------
export const DATE_FILTER_OPTIONS: SelectOption[] = [
  { value: 'TODAY', label: 'Today' },
  { value: 'YESTERDAY', label: 'Yesterday' },
  { value: 'THIS_WEEK', label: 'This Week' },
  { value: 'LAST_WEEK', label: 'Last Week' },
  { value: 'THIS_MONTH', label: 'This Month' },
  { value: 'LAST_MONTH', label: 'Last Month' },
  { value: 'THIS_YEAR', label: 'This Year' },
  { value: 'CUSTOM', label: 'Custom Date Range' },
];

export const EXPORT_FORMAT_OPTIONS: SelectOption[] = [
  { value: 'EXCEL', label: 'Excel (.xlsx)' },
  { value: 'CSV', label: 'CSV (.csv)' },
  { value: 'PDF', label: 'PDF (.pdf)' },
];

/** The 15 report columns (key + header), exact order of COLUMN_REGISTRY. */
export const REPORT_COLUMNS: { key: string; label: string }[] = [
  { key: 'candidate_name', label: 'Candidate Name' },
  { key: 'job_role', label: 'Job Role' },
  { key: 'recruiter', label: 'Recruiter' },
  { key: 'resume_upload_date', label: 'Resume Upload Date' },
  { key: 'total_experience', label: 'Total Experience' },
  { key: 'relevant_experience', label: 'Relevant Experience' },
  { key: 'current_location', label: 'Current Location' },
  { key: 'current_salary', label: 'Current Salary' },
  { key: 'expected_salary', label: 'Expected Salary' },
  { key: 'notice_period', label: 'Notice Period' },
  { key: 'last_working_day', label: 'Last Working Day' },
  { key: 'candidate_status', label: 'Candidate Status' },
  { key: 'job_status', label: 'Job Status' },
  { key: 'interview_date', label: 'Interview Date' },
  { key: 'offer_status', label: 'Offer Status' },
];
