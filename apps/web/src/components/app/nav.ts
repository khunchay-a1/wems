import type { LucideIcon } from 'lucide-react';
import { Bell, Building2, ClipboardCheck, FolderKanban, Home, Settings, Users } from 'lucide-react';

export interface NavItem {
  href: string;
  key: string;
  icon: LucideIcon;
  /** any of these permissions; empty = everyone */
  permissions?: string[];
  /** module flag (NEXT_PUBLIC_FEATURES) */
  feature?: string;
}

/** Left navigation (docs/07-web-ui.md §2) — shown by permission and enabled phase. */
export const NAV: NavItem[] = [
  { href: '/', key: 'myWork', icon: Home },
  { href: '/projects', key: 'projects', icon: FolderKanban, feature: 'documents' },
  { href: '/reviews', key: 'reviews', icon: ClipboardCheck, feature: 'documents' },
  {
    href: '/clients',
    key: 'clients',
    icon: Building2,
    permissions: ['client.read'],
    feature: 'documents',
  },
  { href: '/notifications', key: 'notifications', icon: Bell },
];

export const ADMIN_NAV: NavItem[] = [
  { href: '/admin/users', key: 'users', icon: Users, permissions: ['user.manage'] },
  { href: '/admin/roles', key: 'roles', icon: Settings, permissions: ['role.manage'] },
  { href: '/admin/departments', key: 'departments', icon: Settings, permissions: ['user.manage'] },
  {
    href: '/admin/master',
    key: 'masterData',
    icon: Settings,
    permissions: ['masterdata.manage'],
    feature: 'documents',
  },
  { href: '/admin/numbering', key: 'numbering', icon: Settings, permissions: ['settings.manage'] },
  { href: '/admin/settings', key: 'settings', icon: Settings, permissions: ['settings.manage'] },
  { href: '/admin/audit', key: 'audit', icon: Settings, permissions: ['audit.read'] },
];

export function enabledFeatures(): Set<string> {
  return new Set((process.env.NEXT_PUBLIC_FEATURES ?? 'documents').split(',').map((f) => f.trim()));
}
