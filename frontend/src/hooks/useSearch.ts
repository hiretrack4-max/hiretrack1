import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SearchResponse } from '@/types/api';

export function useSearch(query: string) {
  const term = query.trim();
  return useQuery({
    queryKey: ['search', term],
    enabled: term.length > 0,
    queryFn: async () => {
      const { data } = await api.get<SearchResponse>('/search/', { params: { q: term } });
      return data;
    },
  });
}
