import {
  CircleDollarSign, Coins, Disc3, FileText, House, Inbox, LayoutGrid, ListChecks,
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
  /** More path prefixes that mark it active (a release's runbook is part of Catalog). */
  also?: string[];
};

// Order from the brief (BR Sidebar.dc.html). Marketing is a Phase 2 placeholder.
export const primaryNav: NavItem[] = [
  { label: 'Home', href: '/', match: '/', icon: House },
  { label: 'Approvals', href: '/approvals', match: '/approvals', icon: Inbox, badge: 'approvals' },
  { label: 'Catalog', href: '/catalog/recordings', match: '/catalog', also: ['/releases'], icon: Library },
  { label: 'Money', href: '/money/royalties', match: '/money', icon: CircleDollarSign },
  { label: 'Splits', href: '/splits', match: '/splits', icon: PieChart },
  { label: 'Contracts', href: '/contracts', match: '/contracts', icon: FileText },
  { label: 'Rights', href: '/rights/registrations', match: '/rights', icon: Shield },
  { label: 'Funding', href: '/funding', match: '/funding', icon: Coins },
  { label: 'Roster', href: '/roster', match: '/roster', icon: Users },
  { label: 'Departments', href: '/departments', match: '/departments', icon: LayoutGrid },
  // The Label Head's plans: type a goal, get a plan from what the agents found.
  { label: 'Plan', href: '/plan', match: '/plan', icon: ListChecks },
  { label: 'Marketing', href: '', match: '/marketing', icon: Lock, locked: true },
];

export const footerNav: NavItem[] = [
  { label: 'Activity log', href: '/activity', match: '/activity', icon: Activity },
  { label: 'Settings', href: '/settings/routing', match: '/settings', icon: Settings },
  { label: 'Help', href: '/help', match: '/help', icon: CircleHelp },
];

// Mobile tab bar: 4 items (components.md > Mobile tab bar).
// Releases is a shortcut to Catalog › Releases, where in-progress runbooks come first.
const RELEASES_TAB: NavItem = { label: 'Releases', href: '/catalog/releases', match: '/catalog/releases', also: ['/releases'], icon: Disc3 };
export const tabNav: NavItem[] = [primaryNav[0], primaryNav[1], RELEASES_TAB, primaryNav.find((i) => i.label === 'Money')!];

export function isActive(item: NavItem, pathname: string) {
  if (item.locked) return false;
  const under = (m: string) => pathname === m || pathname.startsWith(m + '/');
  return item.match === '/' ? pathname === '/' : under(item.match) || (item.also ?? []).some(under);
}
