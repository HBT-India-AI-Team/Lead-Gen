import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar, { DRILL_DOWN_ROUTES, NAV_ITEMS } from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';

function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  // Falls back to DRILL_DOWN_ROUTES for pages reached by drilling into a
  // section rather than clicking a Sidebar item directly (e.g. a lead's
  // detail view) — only defaults to "Dashboard" when the route is genuinely
  // unrecognized, not for every page outside the top-level nav.
  const pageTitle =
    NAV_ITEMS.find((item) => item.path === location.pathname)?.label ??
    DRILL_DOWN_ROUTES[location.pathname]?.label ??
    'Dashboard';

  // Navigation state persistence: remembers, per top-level nav item, the
  // full path+query the user last visited it at (e.g. Tender Leads'
  // filters, Human Review/Communication's ?tenderId=). MainLayout already
  // re-renders on every route change (it calls useLocation() above), so a
  // plain useState/useEffect pair here is enough to keep Sidebar in sync —
  // no new context/store needed. Only lives in memory for this session:
  // a real page reload restores state from the URL itself (which already
  // carries it), and this map only matters for "click Sidebar to go back
  // to a page I was already configuring."
  const [lastVisited, setLastVisited] = useState<Record<string, string>>({});

  useEffect(() => {
    const navPath = NAV_ITEMS.find((item) => item.path === location.pathname)?.path;
    if (!navPath) return;

    const full = `${location.pathname}${location.search}`;
    setLastVisited((prev) => (prev[navPath] === full ? prev : { ...prev, [navPath]: full }));
  }, [location.pathname, location.search]);

  return (
    <div className="min-h-screen bg-canvas">
      {/* First focusable element: lets keyboard users jump past the nav. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary focus:shadow-card"
      >
        Skip to main content
      </a>
      <Sidebar collapsed={collapsed} lastVisited={lastVisited} />

      <div
        className="flex min-h-screen flex-col transition-[padding] duration-200 ease-in-out lg:pl-[var(--sidebar-width)]"
        style={{ '--sidebar-width': collapsed ? '5rem' : '16rem' } as React.CSSProperties}
      >
        <Topbar title={pageTitle} collapsed={collapsed} onToggleSidebar={() => setCollapsed((value) => !value)} />

        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6 focus:outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default MainLayout;