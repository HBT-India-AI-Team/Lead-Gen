import { useMemo, useState } from 'react';
import { DashboardContext } from './dashboardContextValue';

export function DashboardProvider({ children }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const value = useMemo(() => ({ selectedCompanyId, setSelectedCompanyId }), [selectedCompanyId]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
