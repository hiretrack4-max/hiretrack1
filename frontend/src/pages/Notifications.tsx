import { useState } from 'react';
import {
  BadgeCheck,
  Bell,
  CalendarClock,
  CheckCheck,
  FileText,
  UserCheck,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { PageHeader } from '@/components/common/PageHeader';
import { Button, Card, EmptyState, Skeleton, Tabs, type TabItem } from '@/components/ui';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationFeed,
  useUnreadCount,
} from '@/hooks/useNotifications';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils';
import type { NotificationEventType } from '@/types/api';

const EVENT_META: Record<NotificationEventType, { icon: LucideIcon; color: string }> = {
  RESUME_UPLOADED: { icon: FileText, color: '#4F8CFF' },
  CANDIDATE_TAGGED: { icon: UserPlus, color: '#EF6A16' },
  INTERVIEW_SCHEDULED: { icon: CalendarClock, color: '#C2410C' },
  OFFER_RELEASED: { icon: BadgeCheck, color: '#FF6B3D' },
  CANDIDATE_JOINED: { icon: UserCheck, color: '#22C55E' },
};

const TABS: TabItem[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
];

export default function Notifications() {
  const toast = useToast();
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const { data, isLoading } = useNotificationFeed(filter);
  const { data: unread } = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Module 10"
        eyebrowIcon={Bell}
        title="Notifications"
        description="Every recruitment event, as it happens."
        actions={
          <Button
            variant="secondary"
            disabled={!unread || markAll.isPending}
            loading={markAll.isPending}
            onClick={() =>
              markAll.mutate(undefined, {
                onSuccess: (res) => toast.success('All caught up', `${res.marked_read} marked read.`),
              })
            }
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        }
      />

      <div className="flex items-center justify-between gap-3">
        <Tabs
          tabs={TABS}
          value={filter}
          onChange={(v) => setFilter(v as 'all' | 'unread' | 'read')}
        />
        {unread ? (
          <span className="rounded-full bg-accent/14 px-3 py-1 text-xs font-semibold text-accent-strong">
            {unread} unread
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bell className="h-7 w-7" />}
            title="You're all caught up"
            description={
              filter === 'unread'
                ? 'No unread notifications right now.'
                : 'Notifications about resumes, mappings, interviews and offers appear here.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {data.map((n) => {
            const meta = EVENT_META[n.event_type] ?? { icon: Bell, color: '#8A90A6' };
            const Icon = meta.icon;
            return (
              <Card
                key={n.id}
                className={cn(
                  'flex items-start gap-3.5 p-4 transition-colors',
                  !n.is_read && 'border-brand-300/50 bg-brand-500/[0.04]',
                )}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!n.is_read && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
                    )}
                    <p className={cn('text-sm', n.is_read ? 'text-muted' : 'font-medium text-ink')}>
                      {n.message}
                    </p>
                  </div>
                  <p className="mt-0.5 text-2xs text-muted">
                    {n.event_type_display} ·{' '}
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                {!n.is_read && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markRead.mutate(n.id)}
                    className="shrink-0"
                  >
                    Mark read
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
