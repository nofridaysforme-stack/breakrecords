import {
  CircleDollarSign, Coins, Disc3, FileText, House, Inbox, LayoutGrid,
  Library, Lock, PieChart, Shield, Users, Activity, Settings, CircleHelp,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  /** Path prefix that marks this item active. */
  match: string;
  icon: LucideIcon;
  badge?: 'approvals';
  locked?: boolean;
};

// Order from the brief (BR Sidebar.dc.html). Marketing is a Phase 2 placeholder.
export const primaryNav: NavItem[] = [
  { label: 'Home', href: '/', match: '/', icon: House },
  { label: 'Approvals', href: '/approvals', match: '/approvals', icon: Inbox, badge: 'approvals' },
  { label: 'Releases', href: '/releases', match: '/releases', icon: Disc3 },
  { label: 'Catalog', href: '/catalog/recordings', match: '/catalog', icon: Library },
  { label: 'Money', href: '/money/royalties', match: '/money', icon: CircleDollarSign },
  { label: 'Splits', href: '/splits', match: '/splits', icon: PieChart },
  { label: 'Contracts', href: '/contracts', match: '/contracts', icon: FileText },
  { label: 'Rights', href: '/rights/registrations', match: '/rights', icon: Shield },
  { label: 'Funding', href: '/funding', match: '/funding', icon: Coins },
  { label: 'Roster', href: '/roster', match: '/roster', icon: Users },
  { label: 'Departments', href: '/departments', match: '/departments', icon: LayoutGrid },
  { label: 'Marketing', href: '', match: '/marketing', icon: Lock, locked: true },
];

export const footerNav: NavItem[] = [
  { label: 'Activity log', href: '/activity', match: '/activity', icon: Activity },
  { label: 'Settings', href: '/settings/routing', match: '/settings', icon: Settings },
  { label: 'Help', href: '/help', match: '/help', icon: CircleHelp },
];

// Mobile tab bar: 4 items (components.md > Mobile tab bar).
export const tabNav: NavItem[] = primaryNav.filter((i) =>
  ['Home', 'Approvals', 'Releases', 'Money'].includes(i.label),
);

export function isActive(item: NavItem, pathname: string) {
  if (item.locked) return false;
  return item.match === '/' ? pathname === '/' : pathname === item.match || pathname.startsWith(item.match + '/');
}
