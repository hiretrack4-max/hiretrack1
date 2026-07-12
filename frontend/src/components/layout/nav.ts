import {
  LayoutDashboard,
  Briefcase,
  Users,
  BarChart3,
  Search,
  Bell,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Jobs', to: '/jobs', icon: Briefcase },
  { label: 'Candidates', to: '/candidates', icon: Users },
  { label: 'Reports', to: '/reports', icon: BarChart3 },
  { label: 'Search', to: '/search', icon: Search },
  { label: 'Notifications', to: '/notifications', icon: Bell },
];
