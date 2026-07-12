import { useQuery } from '@tanstack/react-query';
import { fetchDashboardStats } from '@/lib/api';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: fetchDashboardStats,
  });
}
