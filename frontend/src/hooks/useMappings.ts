import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fetchAllPages } from '@/lib/paged';
import { cleanParams } from '@/lib/utils';
import type { Mapping, Paginated } from '@/types/api';

/** Every candidate↔job mapping (all pages) — for list role tags + report rows. */
export function useAllMappings() {
  return useQuery({
    queryKey: ['mappings', 'all'],
    queryFn: () => fetchAllPages<Mapping>('/mappings/', { ordering: '-applied_date' }, 5000),
  });
}

export interface MappingListParams {
  candidate?: number;
  job?: number;
  mapping_status?: string;
  recruiter_name?: string;
}

export function useMappings(params: MappingListParams) {
  return useQuery({
    queryKey: ['mappings', 'list', params],
    enabled: params.candidate !== undefined || params.job !== undefined,
    queryFn: async () => {
      const { data } = await api.get<Paginated<Mapping>>('/mappings/', {
        params: cleanParams({ ...params, ordering: '-applied_date' }),
      });
      return data.results;
    },
  });
}

export interface MappingInput {
  candidate: number;
  job: number;
  mapping_status: string;
  applied_date: string;
  recruiter_name: string;
}

export function useCreateMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MappingInput) => {
      const { data } = await api.post<Mapping>('/mappings/', payload);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['mappings'] });
      qc.invalidateQueries({ queryKey: ['candidates', 'detail', data.candidate] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: number } & Partial<MappingInput>) => {
      const { data } = await api.patch<Mapping>(`/mappings/${id}/`, payload);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['mappings'] });
      qc.invalidateQueries({ queryKey: ['candidates', 'detail', data.candidate] });
    },
  });
}
