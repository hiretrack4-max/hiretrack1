import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fetchAllPages } from '@/lib/paged';
import { cleanParams } from '@/lib/utils';
import type { Job, JobInput, Paginated, ParsedJobDescription } from '@/types/api';

export interface JobListParams {
  page?: number;
  search?: string;
  job_status?: string;
  department?: string;
  employment_type?: string;
  is_archived?: string;
  ordering?: string;
}

export function useJobs(params: JobListParams) {
  return useQuery({
    queryKey: ['jobs', 'list', params],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Job>>('/jobs/', {
        params: cleanParams({ ...params }),
      });
      return data;
    },
  });
}

export function useJob(id: number | undefined) {
  return useQuery({
    queryKey: ['jobs', 'detail', id],
    enabled: id !== undefined && !Number.isNaN(id),
    queryFn: async () => {
      const { data } = await api.get<Job>(`/jobs/${id}/`);
      return data;
    },
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: JobInput) => {
      const { data } = await api.post<Job>('/jobs/', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateJob(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<JobInput>) => {
      const { data } = await api.patch<Job>(`/jobs/${id}/`, payload);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(['jobs', 'detail', id], data);
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** archive / unarchive / delete a job. */
export function useJobActions(id: number) {
  const qc = useQueryClient();
  const invalidate = (data?: Job) => {
    if (data) qc.setQueryData(['jobs', 'detail', id], data);
    qc.invalidateQueries({ queryKey: ['jobs'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const archive = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Job>(`/jobs/${id}/archive/`);
      return data;
    },
    onSuccess: (data) => invalidate(data),
  });

  const unarchive = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<Job>(`/jobs/${id}/unarchive/`);
      return data;
    },
    onSuccess: (data) => invalidate(data),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await api.delete(`/jobs/${id}/`);
    },
    onSuccess: () => invalidate(),
  });

  return { archive, unarchive, remove };
}

/**
 * Extract structured fields (location, openings, salary) from a pasted job
 * description so the simplified create form can auto-populate (Module 1).
 */
export function useParseJobDescription() {
  return useMutation({
    mutationFn: async (description: string) => {
      const { data } = await api.post<ParsedJobDescription>('/jobs/parse_description/', {
        description,
      });
      return data;
    },
  });
}

/** Every job (all pages) — for the openings-report preview + tag pickers. */
export function useAllJobs() {
  return useQuery({
    queryKey: ['jobs', 'all'],
    queryFn: () => fetchAllPages<Job>('/jobs/', { ordering: '-created_at' }, 2000),
  });
}

/** Simple option list of open jobs for the candidate-mapping picker. */
export function useOpenJobs() {
  return useQuery({
    queryKey: ['jobs', 'open-options'],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Job>>('/jobs/', {
        params: { is_archived: 'false', ordering: '-created_at' },
      });
      // Only jobs that still accept mappings (excludes CLOSED / archived).
      return data.results.filter((j) => j.is_open_for_mapping);
    },
  });
}
