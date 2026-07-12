import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  Briefcase,
  Users,
  FileBarChart2,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardStats } from '@/hooks/useDashboard';
import { useUnreadCount } from '@/hooks/useNotifications';

interface RailItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Which live count drives the badge (if any). */
  count?: 'jobs' | 'candidates' | 'unread';
}

const RAIL_ITEMS: RailItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutGrid },
  { label: 'Jobs', to: '/jobs', icon: Briefcase, count: 'jobs' },
  { label: 'Candidates', to: '/candidates', icon: Users, count: 'candidates' },
  { label: 'Reports', to: '/reports', icon: FileBarChart2 },
  { label: 'Notifications', to: '/notifications', icon: Bell, count: 'unread' },
];

export interface RailProps {
  collapsed: boolean;
  onToggle: () => void;
}

/** HireTrack left sidebar: brand mark, nav with live counts, collapse, footer clock. */
export function Rail({ collapsed, onToggle }: RailProps) {
  const { data } = useDashboardStats();
  const { data: unread } = useUnreadCount();
  const counts = {
    jobs: data?.kpis.total_jobs,
    candidates: data?.kpis.candidates_uploaded,
    unread: unread || undefined,
  };

  const [clock, setClock] = useState(() => formatClock(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock(new Date())), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <aside className={cn('rail', collapsed && 'mini')}>
      <div className="brand">
        <div className="brand-mark">
          <div className="brand-dot">H</div>
          <div className="brand-name">HireTrack</div>
          <button
            className="rail-toggle"
            onClick={onToggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '▶' : '◀'}
          </button>
        </div>
        <div className="brand-sub">Recruitment Portal</div>
      </div>

      <nav className="nav">
        <div className="nav-label">Workspace</div>
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const count = item.count ? counts[item.count] : undefined;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={item.label}
              className={({ isActive }) => cn('nav-item', isActive && 'on')}
            >
              <span className="ic">
                <Icon size={18} strokeWidth={1.9} />
              </span>
              <span className="lbl">{item.label}</span>
              {count !== undefined && <span className="ct">{count}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="rail-foot">
        <span className="who">
          <b>Avinash S</b> · HR
        </span>
        <span>{clock}</span>
      </div>
    </aside>
  );
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}
