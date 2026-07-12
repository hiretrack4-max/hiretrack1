/**
 * TypeScript mirrors of the HireTrack DRF responses.
 * Field names match backend/core/serializers.py exactly.
 *
 * Note: DRF renders DecimalField as a string, so salary / experience fields are
 * typed `string | null`. Integer fields (openings, notice period) are `number`.
 */

/** Standard DRF page-number pagination envelope (PAGE_SIZE = 25). */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// --- Module 7: Dashboard --------------------------------------------------
export interface DashboardKpis {
  total_jobs: number;
  open_jobs: number;
  closed_jobs: number;
  candidates_uploaded: number;
  interview_scheduled: number;
  offers_released: number;
  joined_candidates: number;
  rejected_candidates: number;
}

/** One row of a status distribution series (candidate/job). */
export interface StatusSeriesRow {
  status: string;
  label: string;
  count: number;
}

export interface DepartmentRow {
  department: string;
  jobs: number;
  candidates: number;
}

export interface DashboardCharts {
  hiring_pipeline: StatusSeriesRow[];
  candidate_status: StatusSeriesRow[];
  job_status: StatusSeriesRow[];
  department_hiring: DepartmentRow[];
}

export interface DashboardStats {
  kpis: DashboardKpis;
  charts: DashboardCharts;
}

// --- Module 10: Notifications ---------------------------------------------
export type NotificationEventType =
  | 'RESUME_UPLOADED'
  | 'CANDIDATE_TAGGED'
  | 'INTERVIEW_SCHEDULED'
  | 'OFFER_RELEASED'
  | 'CANDIDATE_JOINED';

export interface Notification {
  id: number;
  event_type: NotificationEventType;
  event_type_display: string;
  message: string;
  object_type: string;
  object_id: string;
  is_read: boolean;
  created_at: string;
}

export interface UnreadCount {
  unread: number;
}

// --- Module 1 & 6: Job ----------------------------------------------------
export type JobStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'ON_HOLD';
export type EmploymentType =
  | 'FULL_TIME'
  | 'PART_TIME'
  | 'CONTRACT'
  | 'INTERNSHIP'
  | 'TEMPORARY';

export interface JobDescription {
  summary: string;
  responsibilities: string;
  required_skills: string;
  qualifications: string;
  benefits: string;
}

export interface Job {
  id: number;
  job_id: string;
  job_role: string;
  department: string;
  hiring_manager: string;
  experience_min_years: string;
  experience_max_years: string | null;
  location: string;
  employment_type: EmploymentType;
  number_of_openings: number;
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: string;
  job_status: JobStatus;
  is_archived: boolean;
  is_open_for_mapping: boolean;
  candidate_count: number;
  /** ISO datetime the job was closed (null unless CLOSED). */
  closed_at: string | null;
  description: JobDescription | null;
  created_at: string;
  updated_at: string;
}

/** Writable payload for creating / updating a Job (nested description). */
export interface JobInput {
  job_role: string;
  department: string;
  hiring_manager: string;
  experience_min_years: string;
  experience_max_years: string | null;
  location: string;
  employment_type: EmploymentType;
  number_of_openings: number;
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: string;
  job_status: JobStatus;
  description: JobDescription;
}

/** Structured fields extracted from a pasted job description (Module 1). */
export interface ParsedJobDescription {
  location: string | null;
  number_of_openings: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
}

// --- Modules 3 & 5: Candidate ---------------------------------------------
export type CandidateStatusValue =
  | 'RESUME_RECEIVED'
  | 'SHORTLISTED'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_IN_PROGRESS'
  | 'INTERVIEW_COMPLETED'
  | 'OFFER_RELEASED'
  | 'JOINED'
  | 'REJECTED'
  | 'ON_HOLD';

export type SkillType = 'SKILL' | 'TECHNOLOGY' | 'CERTIFICATION';

export interface CandidateSkill {
  id: number;
  candidate: number;
  name: string;
  skill_type: SkillType;
}

export interface CandidateExperience {
  id: number;
  candidate: number;
  company: string;
  designation: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string;
}

/** Compact mapping view embedded inside a Candidate profile. */
export interface MappingSummary {
  id: number;
  job: number;
  job_id: string;
  job_role: string;
  job_status: JobStatus;
  mapping_status: string;
  applied_date: string;
  recruiter_name: string;
}

/** Lightweight projection for list endpoints (Module 9 result rows). */
export interface CandidateListItem {
  id: number;
  full_name: string;
  email: string;
  mobile: string;
  current_location: string;
  current_company: string;
  current_designation: string;
  total_experience_years: string | null;
  candidate_status: CandidateStatusValue;
  skills_cache: string;
  /** Parser "verify" flags — keys the extractor was unsure about. */
  parse_flags: string[];
  created_at: string;
}

/** Full candidate profile (Module 5). Parsed fields remain HR-editable. */
export interface Candidate {
  id: number;
  full_name: string;
  email: string;
  mobile: string;
  address: string;
  current_location: string;
  total_experience_years: string | null;
  relevant_experience_years: string | null;
  current_company: string;
  current_designation: string;
  highest_qualification: string;
  skills_cache: string;
  /** Parser "verify" flags — keys the extractor was unsure about (read-only). */
  parse_flags: string[];
  /** Legacy single-value salary fields (kept for back-compat; de-emphasized). */
  current_salary: string | null;
  expected_salary: string | null;
  /** CTC split in LPA (lakhs/annum). Writable inputs. */
  current_ctc_fixed: string | null;
  current_ctc_variable: string | null;
  expected_ctc_fixed: string | null;
  expected_ctc_variable: string | null;
  /** Read-only computed (GET only): fixed + variable, and hike %. */
  current_ctc_total: number | null;
  expected_ctc_total: number | null;
  hike_percent: number | null;
  notice_period_days: number | null;
  last_working_day: string | null;
  candidate_status: CandidateStatusValue;
  skills: CandidateSkill[];
  experiences: CandidateExperience[];
  job_mappings: MappingSummary[];
  created_at: string;
  updated_at: string;
}

// --- Module 4: Candidate ↔ Job mapping ------------------------------------
export type MappingStatus =
  | 'APPLIED'
  | 'UNDER_REVIEW'
  | 'SHORTLISTED'
  | 'INTERVIEWING'
  | 'OFFERED'
  | 'HIRED'
  | 'REJECTED'
  | 'ON_HOLD';

export interface Mapping {
  id: number;
  candidate: number;
  candidate_name: string;
  job: number;
  job_id: string;
  job_role: string;
  mapping_status: MappingStatus;
  applied_date: string;
  recruiter_name: string;
  created_at: string;
  updated_at: string;
}

// --- Module 5: Interview & Offer ------------------------------------------
export type InterviewResult = 'PENDING' | 'PASSED' | 'FAILED' | 'ON_HOLD';

export interface Interview {
  id: number;
  mapping: number;
  interview_date: string | null;
  interview_time: string | null;
  interview_round: string;
  interviewer_name: string;
  feedback: string;
  result: InterviewResult;
  created_at: string;
  updated_at: string;
}

export type OfferStatus = 'DRAFT' | 'RELEASED' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';

export interface Offer {
  id: number;
  mapping: number;
  offered_salary: string | null;
  offer_status: OfferStatus;
  offer_date: string | null;
  expected_joining_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

// --- Recruitment status history -------------------------------------------
export interface RecruitmentStatusEntry {
  id: number;
  candidate: number;
  mapping: number | null;
  previous_status: string;
  new_status: string;
  changed_at: string;
  changed_by: string | null;
  notes: string;
}

// --- Module 2: Resume -----------------------------------------------------
export type ParseStatus = 'PENDING' | 'PROCESSING' | 'PARSED' | 'FAILED';

export interface Resume {
  id: number;
  candidate: number | null;
  file: string;
  original_filename: string;
  file_type: string;
  parse_status: ParseStatus;
  parse_error: string;
  uploaded_at: string;
  parsed_at: string | null;
}

// --- Module 8: Report configuration ---------------------------------------
export type DateFilter =
  | 'TODAY'
  | 'YESTERDAY'
  | 'THIS_WEEK'
  | 'LAST_WEEK'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'THIS_YEAR'
  | 'CUSTOM';

export type ExportFormat = 'EXCEL' | 'CSV' | 'PDF';

export interface ReportConfiguration {
  id: number;
  name: string;
  date_filter: DateFilter;
  custom_start: string | null;
  custom_end: string | null;
  columns: string[];
  export_format: ExportFormat;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// --- Module 9: Global search ----------------------------------------------
export interface SearchResponse {
  query: string;
  count: number;
  results: CandidateListItem[];
}
