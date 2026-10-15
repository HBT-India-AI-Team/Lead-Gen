import { useOutletContext } from 'react-router-dom';

export function useDashboardData() {
  return useOutletContext();
}
