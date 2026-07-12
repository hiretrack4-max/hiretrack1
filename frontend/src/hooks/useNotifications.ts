import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fetchNotifications, fetchUnreadCount } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cleanParams } from '@/lib/utils';
import type { Notification, Paginated } from '@/types/api';

export function useUnreadCount() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
}

/** Compact list used by the topbar bell dropdown (latest few). */
export function useNotifications() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: fetchNotifications,
    enabled: isAuthenticated,
  });
}

/** Full notifications feed for the Notifications page, filterable by read state. */
export function useNotificationFeed(filter: 'all' | 'unread' | 'read') {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['notifications', 'feed', filter],
    enabled: isAuthenticated,
    queryFn: async () => {
      const params = cleanParams({
        ordering: '-created_at',
        is_read: filter === 'all' ? undefined : String(filter === 'read'),
      });
      const { data } = await api.get<Paginated<Notification>>('/notifications/', { params });
      return data.results;
    },
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<Notification>(`/notifications/${id}/mark_read/`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ marked_read: number }>('/notifications/mark_all_read/');
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
