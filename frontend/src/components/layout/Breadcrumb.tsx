import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { DRILL_DOWN_ROUTES, NAV_ITEMS } from './Sidebar';

function Breadcrumb() {
  const location = useLocation();
  const current = NAV_ITEMS.find((item) => item.path === location.pathname);
  // A drill-down route (e.g. /lead-details) isn't in NAV_ITEMS, so without
  // this it silently rendered as bare "Home" with no second segment —
  // renders its real parent section + page label instead.
  const drillDown = !current ? DRILL_DOWN_ROUTES[location.pathname] : undefined;
  const parentSection = drillDown ? NAV_ITEMS.find((item) => item.path === drillDown.parentPath) : undefined;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
      <Link to="/dashboard" className="flex items-center gap-1 text-ink-muted no-underline hover:text-primary hover:no-underline">
        <Home className="h-3.5 w-3.5" strokeWidth={2} />
        Home
      </Link>
      {current && (
        <>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-hairline-strong" strokeWidth={2} />
          <span className="font-semibold text-ink">{current.label}</span>
        </>
      )}
      {drillDown && (
        <>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-hairline-strong" strokeWidth={2} />
          {parentSection ? (
            <Link to={parentSection.path} className="text-ink-muted no-underline hover:text-primary hover:no-underline">
              {parentSection.label}
            </Link>
          ) : (
            <span>{drillDown.parentPath}</span>
          )}
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-hairline-strong" strokeWidth={2} />
          <span className="font-semibold text-ink">{drillDown.label}</span>
        </>
      )}
    </nav>
  );
}

export default Breadcrumb;