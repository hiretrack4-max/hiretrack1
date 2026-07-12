import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Offer, Paginated } from '@/types/api';

/** Fetch the (0 or 1) offer attached to a mapping — Offer is a OneToOne. */
export function useOffer(mappingId: number | undefined) {
  return useQuery({
    queryKey: ['offers', mappingId],
    enabled: mappingId !== undefined,
    queryFn: async () => {
      const { data } = await api.get<Paginated<Offer>>('/offers/', {
        params: { mapping: mappingId },
      });
      return data.results[0] ?? null;
    },
  });
}

export interface OfferInput {
  mapping: number;
  offered_salary: string | null;
  offer_status: string;
  offer_date: string | null;
  expected_joining_date: string | null;
  notes: string;
}

export function useCreateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: OfferInput) => {
      const { data } = await api.post<Offer>('/offers/', payload);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['offers', data.mapping] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: number } & Partial<OfferInput>) => {
      const { data } = await api.patch<Offer>(`/offers/${id}/`, payload);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['offers', data.mapping] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
