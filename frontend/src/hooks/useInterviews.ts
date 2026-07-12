import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Interview, Paginated } from '@/types/api';

export function useInterviews(mappingId: number | undefined) {
  return useQuery({
    queryKey: ['interviews', mappingId],
    enabled: mappingId !== undefined,
    queryFn: async () => {
      const { data } = await api.get<Paginated<Interview>>('/interviews/', {
        params: { mapping: mappingId, ordering: 'interview_date' },
      });
      return data.results;
    },
  });
}

export interface InterviewInput {
  mapping: number;
  interview_date: string | null;
  interview_time: string | null;
  interview_round: string;
  interviewer_name: string;
  feedback: string;
  result: string;
}

export function useCreateInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: InterviewInput) => {
      const { data } = await api.post<Interview>('/interviews/', payload);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['interviews', data.mapping] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: number } & Partial<InterviewInput>) => {
      const { data } = await api.patch<Interview>(`/interviews/${id}/`, payload);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['interviews', data.mapping] });
    },
  });
}
