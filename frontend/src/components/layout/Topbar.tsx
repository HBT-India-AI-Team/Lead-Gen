import { useState } from 'react';
import { Bell, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Breadcrumb from './Breadcrumb';
import SearchBox from '../ui/SearchBox';

export interface TopbarProps {
  title: string;
  collapsed: boolean;
  onToggleSidebar: () => void;
}

function Topbar({ title, collapsed, onToggleSidebar }: TopbarProps) {
  const [search, setSearch] = useState('');

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-surface/90 px-6 py-3.5 backdrop-blur-md">
      <div className="flex items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-hairline-strong bg-surface text-ink-soft transition-colors hover:border-primary-tint-2 hover:bg-primary-tint hover:text-primary"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" strokeWidth={2} /> : <PanelLeftClose className="h-4 w-4" strokeWidth={2} />}
          </button>

          <div className="min-w-0">
            <Breadcrumb />
            <h1 className="mt-0.5 truncate text-xl font-bold tracking-tight text-ink">{title}</h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <SearchBox value={search} onChange={setSearch} placeholder="Search leads, companies…" className="hidden w-72 md:flex" />

          <button
            type="button"
            aria-label="Notifications"
            className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-hairline-strong bg-surface text-ink-soft transition-colors hover:border-primary-tint-2 hover:bg-primary-tint hover:text-primary"
          >
            <Bell className="h-4 w-4" strokeWidth={2} />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-secondary" />
          </button>

          {/* Profile avatar — subtle brand-blue ring to mark it as the account
              affordance without adding a heavy border. */}
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-ink-inverse shadow-sm ring-2 ring-primary-tint-2">
            RM
          </div>
        </div>
      </div>
    </header>
  );
}

export default Topbar;
