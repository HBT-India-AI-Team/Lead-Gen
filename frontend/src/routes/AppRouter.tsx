import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Dashboard from '../pages/Dashboard';
import TenderLeads from '../pages/TenderLeads';
import LeadDetails from '../pages/LeadDetails';
import HumanReview from '../pages/HumanReview';
import Signals from '../pages/Signals';
import Communication from '../pages/Communication';
import LeadPipeline from '../pages/LeadPipeline';
import Analytics from '../pages/Analytics';
import Settings from '../pages/Settings';
import ModelMaintenance from '../pages/ModelMaintenance';
import { readLandingPagePath } from '../constants/settingsPreferences';

import B2BLeadWorkspaceDashboard from '../pages/B2BLeadWorkspaceDashboard';

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          {/* Reads the Settings page's "Default Landing Page" preference */}
          <Route index element={<Navigate to={readLandingPagePath()} replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="tender-leads" element={<TenderLeads />} />
          <Route path="lead-workspace" element={<B2BLeadWorkspaceDashboard />} />
          <Route path="lead-details" element={<LeadDetails />} />
          <Route path="ai-executive-analysis" element={<Navigate to="/lead-workspace" replace />} />
          <Route path="signals" element={<Signals />} />
          <Route path="human-review" element={<HumanReview />} />
          <Route path="communication" element={<Communication />} />
          <Route path="lead-pipeline" element={<LeadPipeline />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="model-maintenance" element={<ModelMaintenance />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;