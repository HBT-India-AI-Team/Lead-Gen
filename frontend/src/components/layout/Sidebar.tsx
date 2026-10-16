import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  FileSearch,
  ClipboardCheck,
  Mail,
  BarChart3,
  Settings as SettingsIcon,
  BrainCircuit,
  Radar,
} from 'lucide-react';
import { cn } from '../../utils/formatters';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

// Single source of truth for the shell's navigation — Sidebar, Breadcrumb,
// and AppRouter all read from this list instead of maintaining three
// separate copies of the same path/label pairs.
export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/tender-leads', label: 'Leads', icon: FileSearch },
  { path: '/signals', label: 'Signals', icon: Radar },
  { path: '/human-review', label: 'Expert Review', icon: ClipboardCheck },
  { path: '/communication', label: 'Communication', icon: Mail },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/model-maintenance', label: 'Model Maintenance', icon: BrainCircuit },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
];

// Drill-down routes reachable from a nav section but not themselves in
// NAV_ITEMS (e.g. clicking a lead from Leads). MainLayout/Breadcrumb consult
// this before falling back to "Dashboard" as the page title, so opening one
// of these no longer silently shows the wrong title/breadcrumb — see
// MainLayout.tsx's pageTitle and Breadcrumb.tsx for where this is read.
export const DRILL_DOWN_ROUTES: Record<string, { label: string; parentPath: string }> = {
  '/lead-details': { label: 'Lead Details', parentPath: '/tender-leads' },
};

export interface SidebarProps {
  collapsed: boolean;
  // Per-nav-item last full path+query visited (see MainLayout.tsx) — lets
  // clicking a Sidebar item return to exactly where the user left off
  // (e.g. Tender Leads' filters, Human Review/Communication's
  // ?tenderId=) instead of always resetting to the bare path. Optional so
  // Sidebar still works standalone (falls back to the bare nav path).
  lastVisited?: Record<string, string>;
}

function Sidebar({ collapsed, lastVisited = {} }: SidebarProps) {
  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-hairline bg-surface transition-[width] duration-200 ease-in-out lg:flex',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Branded header block — first brand touchpoint. Logo mark + product
          name + relationship-banking subtitle, sitting on a faint blue wash
          so it reads as an intentional masthead, not a default template row. */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center border-b border-hairline bg-primary-tint/40',
          collapsed ? 'justify-center px-0' : 'gap-3 px-5'
        )}
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-ink-inverse shadow-sm">
          {/* Yellow accent dot on the monogram — the header's one accent touch */}
          <span className="relative">
            F
            <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">Fintech Lead Intelligence</p>
            <p className="truncate text-xs font-medium text-ink-muted">Relationship Banking</p>
          </div>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-5">
        <ul className="grid gap-1">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
            <li key={path}>
              <NavLink
                to={lastVisited[path] ?? path}
                title={collapsed ? label : undefined}
                aria-label={collapsed ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    // Signature ledger bar lives on the item itself via
                    // overflow-hidden + an inset ::before-style span below,
                    // so the active rule sits flush inside the rounded item
                    // rather than clipping off the sidebar edge.
                    'relative flex h-11 items-center overflow-hidden rounded-lg text-sm font-medium no-underline transition-all duration-150 hover:no-underline',
                    collapsed ? 'justify-center px-0' : 'gap-3 px-3.5',
                    isActive
                      ? 'bg-primary text-ink-inverse shadow-sm'
                      : 'text-ink-soft hover:bg-primary-tint hover:text-primary'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Signature ledger bar. On the active (blue-filled) item
                        it renders in the yellow accent so it stays visible against
                        the blue and ties back to the header's monogram dot; this
                        is the one place the accent appears in the nav, kept to a
                        single hairline rule. */}
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-accent" />
                    )}
                    <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

export default Sidebar;
