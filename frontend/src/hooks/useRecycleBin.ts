import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CandidateListItem,
  Job,
  RecycleBin,
  ResetResult,
} from '@/types/api';

/** Everything currently in the Recycle Bin — soft-deleted candidates & jobs. */
export function useRecycleBin() {
  return useQuery({
    queryKey: ['recycle-bin'],
    queryFn: async () => {
      const { data } = await api.get<RecycleBin>('/recycle-bin/');
      return data;
    },
  });
}

/**
 * After a restore / purge / reset the candidate, job, dashboard and recycle-bin
 * caches can all shift, so invalidate them together.
 */
function useInvalidateBin() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['recycle-bin'] });
    qc.invalidateQueries({ queryKey: ['candidates'] });
    qc.invalidateQueries({ queryKey: ['jobs'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useRestoreCandidate() {
  const invalidate = useInvalidateBin();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<CandidateListItem>(`/candidates/${id}/restore/`);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useRestoreJob() {
  const invalidate = useInvalidateBin();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<Job>(`/jobs/${id}/restore/`);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function usePurgeCandidate() {
  const invalidate = useInvalidateBin();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/candidates/${id}/purge/`);
    },
    onSuccess: invalidate,
  });
}

export function usePurgeJob() {
  const invalidate = useInvalidateBin();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/jobs/${id}/purge/`);
    },
    onSuccess: invalidate,
  });
}

/** Soft-delete ALL candidates & jobs (fresh start); everything stays restorable. */
export function useResetAll() {
  const invalidate = useInvalidateBin();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ResetResult>('/reset/');
      return data;
    },
    onSuccess: invalidate,
  });
}
