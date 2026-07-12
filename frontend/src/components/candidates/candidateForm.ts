/**
 * Shared editable-candidate form state + mappers.
 *
 * Used by both the candidate edit panel (CandidateOverview) and the resume
 * capture add flow (CandidateCreate) so the field set, CTC normalization and
 * payload shape never drift between the two.
 */
import type { CandidateUpdate } from '@/hooks/useCandidates';
import type { ResumeParsePreview } from '@/hooks/useResumes';
import { parseLpaInput } from '@/lib/salary';
import type { Candidate } from '@/types/api';

export interface CandidateFormState {
  full_name: string;
  email: string;
  mobile: string;
  address: string;
  current_location: string;
  total_experience_years: string;
  relevant_experience_years: string;
  current_company: string;
  current_designation: string;
  highest_qualification: string;
  // CTC split — raw strings as typed (auto-detected to LPA on save/blur).
  current_ctc_fixed: string;
  current_ctc_variable: string;
  expected_ctc_fixed: string;
  expected_ctc_variable: string;
  notice_period_days: string;
  last_working_day: string;
}

export function blankCandidateForm(): CandidateFormState {
  return {
    full_name: '',
    email: '',
    mobile: '',
    address: '',
    current_location: '',
    total_experience_years: '',
    relevant_experience_years: '',
    current_company: '',
    current_designation: '',
    highest_qualification: '',
    current_ctc_fixed: '',
    current_ctc_variable: '',
    expected_ctc_fixed: '',
    expected_ctc_variable: '',
    notice_period_days: '',
    last_working_day: '',
  };
}

export function candidateToForm(c: Candidate): CandidateFormState {
  return {
    full_name: c.full_name,
    email: c.email,
    mobile: c.mobile,
    address: c.address,
    current_location: c.current_location,
    total_experience_years: c.total_experience_years ?? '',
    relevant_experience_years: c.relevant_experience_years ?? '',
    current_company: c.current_company,
    current_designation: c.current_designation,
    highest_qualification: c.highest_qualification,
    current_ctc_fixed: c.current_ctc_fixed ?? '',
    current_ctc_variable: c.current_ctc_variable ?? '',
    expected_ctc_fixed: c.expected_ctc_fixed ?? '',
    expected_ctc_variable: c.expected_ctc_variable ?? '',
    notice_period_days: c.notice_period_days === null ? '' : String(c.notice_period_days),
    last_working_day: c.last_working_day ?? '',
  };
}

/**
 * Prefill the form from a resume parse *preview* (no candidate exists yet).
 * The parser doesn't extract CTC / notice period, so those stay blank for the
 * HR user to fill in before saving.
 */
export function parsedToForm(preview: ResumeParsePreview['fields']): CandidateFormState {
  return {
    ...blankCandidateForm(),
    full_name: preview.full_name,
    email: preview.email,
    mobile: preview.mobile,
    address: preview.address,
    current_location: preview.current_location,
    total_experience_years: preview.total_experience_years,
    relevant_experience_years: preview.relevant_experience_years,
    current_company: preview.current_company,
    current_designation: preview.current_designation,
    highest_qualification: preview.highest_qualification,
  };
}

/** Build the API payload, normalizing CTC inputs to LPA numbers (or null). */
export function buildCandidatePayload(form: CandidateFormState): CandidateUpdate {
  const strOrNull = (v: string) => (v.trim() === '' ? null : v.trim());
  return {
    full_name: form.full_name.trim(),
    email: form.email.trim(),
    mobile: form.mobile.trim(),
    address: form.address.trim(),
    current_location: form.current_location.trim(),
    total_experience_years: strOrNull(form.total_experience_years),
    relevant_experience_years: strOrNull(form.relevant_experience_years),
    current_company: form.current_company.trim(),
    current_designation: form.current_designation.trim(),
    highest_qualification: form.highest_qualification.trim(),
    current_ctc_fixed: parseLpaInput(form.current_ctc_fixed),
    current_ctc_variable: parseLpaInput(form.current_ctc_variable),
    expected_ctc_fixed: parseLpaInput(form.expected_ctc_fixed),
    expected_ctc_variable: parseLpaInput(form.expected_ctc_variable),
    notice_period_days:
      form.notice_period_days.trim() === '' ? null : Number(form.notice_period_days),
    last_working_day: strOrNull(form.last_working_day),
  };
}
