import { Outlet, Route, Routes } from 'react-router-dom';
import { DemoSessionProvider } from '@/auth/DemoSession';
import AppShell from '@/components/AppShell';
import MarketingShell from '@/components/MarketingShell';
import Tour, { TourProvider } from '@/components/Tour';
import AdminPage from '@/pages/AdminPage';
import AgentPage from '@/pages/AgentPage';
import AuditPage from '@/pages/AuditPage';
import InboxPage from '@/pages/InboxPage';
import LandingPage from '@/pages/LandingPage';
import NotFoundPage from '@/pages/NotFoundPage';
import PricingPage from '@/pages/PricingPage';
import ReplayPage from '@/pages/ReplayPage';
import SessionPage from '@/pages/SessionPage';
import SettingsPage from '@/pages/SettingsPage';

function ConsoleRoot() {
  return (
    <DemoSessionProvider>
      <TourProvider>
        <Tour />
        <Outlet />
      </TourProvider>
    </DemoSessionProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<MarketingShell />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
      </Route>

      <Route element={<ConsoleRoot />}>
        <Route element={<AppShell />}>
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/sessions/:id" element={<SessionPage />} />
          <Route path="/sessions/:id/replay" element={<ReplayPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
