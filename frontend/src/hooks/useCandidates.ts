import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fetchAllPages } from '@/lib/paged';
import { cleanParams } from '@/lib/utils';
import type {
  Candidate,
  CandidateListItem,
  Paginated,
  RecruitmentStatusEntry,
} from '@/types/api';

export interface CandidateListParams {
  page?: number;
  search?: string;
  candidate_status?: string;
  current_location?: string;
  ordering?: string;
}

export function useCandidates(params: CandidateListParams) {
  return useQuery({
    queryKey: ['candidates', 'list', params],
    queryFn: async () => {
      const { data } = await api.get<Paginated<CandidateListItem>>('/candidates/', {
        params: cleanParams({ ...params }),
      });
      return data;
    },
  });
}

/** Every candidate (all pages, capped) — for the candidate-report preview. */
export function useAllCandidates() {
  return useQuery({
    queryKey: ['candidates', 'all'],
    queryFn: () =>
      fetchAllPages<CandidateListItem>('/candidates/', { ordering: '-created_at' }, 3000),
  });
}

export function useCandidate(id: number | undefined) {
  return useQuery({
    queryKey: ['candidates', 'detail', id],
    enabled: id !== undefined && !Number.isNaN(id),
    queryFn: async () => {
      const { data } = await api.get<Candidate>(`/candidates/${id}/`);
      return data;
    },
  });
}

/** Editable candidate fields (parsed + HR-owned, Module 5). */
export type CandidateUpdate = Partial<
  Pick<
    Candidate,
    | 'full_name'
    | 'email'
    | 'mobile'
    | 'address'
    | 'current_location'
    | 'total_experience_years'
    | 'relevant_experience_years'
    | 'current_company'
    | 'current_designation'
    | 'highest_qualification'
    | 'current_salary'
    | 'expected_salary'
    | 'notice_period_days'
    | 'last_working_day'
  >
> & {
  /** CTC split written in normalized LPA (lakhs/annum). */
  current_ctc_fixed?: number | null;
  current_ctc_variable?: number | null;
  expected_ctc_fixed?: number | null;
  expected_ctc_variable?: number | null;
  /** Pipeline status (writable on the full serializer). */
  candidate_status?: string;
};

/** Create a new candidate profile (used by the resume-capture add flow). */
export function useCreateCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CandidateUpdate) => {
      const { data } = await api.post<Candidate>('/candidates/', payload);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(['candidates', 'detail', data.id], data);
      qc.invalidateQueries({ queryKey: ['candidates', 'list'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateCandidate(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CandidateUpdate) => {
      const { data } = await api.patch<Candidate>(`/candidates/${id}/`, payload);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(['candidates', 'detail', id], data);
      qc.invalidateQueries({ queryKey: ['candidates', 'list'] });
    },
  });
}

export function useSetCandidateStatus(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { candidate_status: string; notes?: string }) => {
      const { data } = await api.post<Candidate>(`/candidates/${id}/set_status/`, payload);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(['candidates', 'detail', id], data);
      qc.invalidateQueries({ queryKey: ['candidates', 'list'] });
      qc.invalidateQueries({ queryKey: ['recruitment-status', id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/**
 * Tag / untag a candidate to a job (Module 4). The backend action returns the
 * full updated candidate (nested job_mappings reflect the change) and enforces
 * the closed-job rule (400 on a closed/archived job).
 */
export function useTagCandidate(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (job: number) => {
      const { data } = await api.post<Candidate>(`/candidates/${id}/tag/`, { job });
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(['candidates', 'detail', id], data);
      qc.invalidateQueries({ queryKey: ['candidates', 'list'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUntagCandidate(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (job: number) => {
      const { data } = await api.post<Candidate>(`/candidates/${id}/untag/`, { job });
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(['candidates', 'detail', id], data);
      qc.invalidateQueries({ queryKey: ['candidates', 'list'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** Delete a candidate profile (Module 5). */
export function useDeleteCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/candidates/${id}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidates'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useRecruitmentStatus(candidateId: number | undefined) {
  return useQuery({
    queryKey: ['recruitment-status', candidateId],
    enabled: candidateId !== undefined && !Number.isNaN(candidateId),
    queryFn: async () => {
      const { data } = await api.get<Paginated<RecruitmentStatusEntry>>(
        '/recruitment-status/',
        { params: { candidate: candidateId, ordering: '-changed_at' } },
      );
      return data.results;
    },
  });
}
