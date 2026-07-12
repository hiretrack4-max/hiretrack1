import { NavLink } from 'react-router-dom';
import { ChevronLeft, LogOut, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import { NAV_ITEMS } from './nav';
import { useAuth } from '@/context/AuthContext';
import { useUnreadCount } from '@/hooks/useNotifications';

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { username, logout } = useAuth();
  const { data: unread } = useUnreadCount();

  return (
    <aside
      className={cn(
        'relative z-30 hidden shrink-0 flex-col bg-midnight bg-sidebar-glow transition-[width] duration-300 ease-smooth md:flex',
        collapsed ? 'w-[76px]' : 'w-64',
      )}
    >
      {/* Brand */}
      <div className={cn('flex h-16 items-center px-4', collapsed && 'justify-center px-0')}>
        <Logo compact={collapsed} />
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-16 z-40 hidden h-6 w-6 items-center justify-center rounded-full border border-midnight-500 bg-midnight-600 text-midnight-muted shadow-md transition-colors hover:text-white md:flex"
        aria-label="Toggle sidebar"
      >
        <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
      </button>

      {/* Nav */}
      <nav className="mt-4 flex-1 space-y-1 px-3">
        {!collapsed && (
          <p className="px-3 pb-2 text-2xs font-semibold uppercase tracking-widest text-midnight-muted/70">
            Menu
          </p>
        )}
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isNotifications = item.to === '/notifications';
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  collapsed && 'justify-center',
                  isActive
                    ? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                    : 'text-midnight-muted hover:bg-white/5 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-6 -translate-y-1/2 rounded-r-full bg-brand-gradient" style={{ width: 3 }} />
                  )}
                  <span className="relative">
                    <Icon className="h-[18px] w-[18px]" />
                    {isNotifications && unread ? (
                      <span className="absolute -right-1.5 -top-1.5 flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                      </span>
                    ) : null}
                  </span>
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                  {!collapsed && isNotifications && unread ? (
                    <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-2xs font-semibold text-accent-soft">
                      {unread}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Upgrade / footer card */}
      {!collapsed && (
        <div className="mx-3 mb-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="h-4 w-4 text-accent-soft" />
            <span className="text-xs font-semibold">Recruiter workspace</span>
          </div>
          <p className="mt-1 text-2xs leading-relaxed text-midnight-muted">
            One place to track every job, candidate and hire.
          </p>
        </div>
      )}

      {/* User + logout */}
      <div className={cn('border-t border-white/10 p-3', collapsed && 'px-2')}>
        <button
          onClick={logout}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-sm text-midnight-muted transition-colors hover:bg-white/5 hover:text-white',
            collapsed && 'justify-center',
          )}
          title="Sign out"
        >
          <LogOut className="h-[18px] w-[18px]" />
          {!collapsed && (
            <span className="flex-1 text-left">
              <span className="block truncate text-xs font-medium text-white">{username}</span>
              <span className="block text-2xs text-midnight-muted">Sign out</span>
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
