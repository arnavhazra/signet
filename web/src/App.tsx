import { Route, Routes } from 'react-router-dom';
import AppShell from '@/components/AppShell';
import Tour, { TourProvider } from '@/components/Tour';
import AdminPage from '@/pages/AdminPage';
import AgentPage from '@/pages/AgentPage';
import AuditPage from '@/pages/AuditPage';
import InboxPage from '@/pages/InboxPage';
import NotFoundPage from '@/pages/NotFoundPage';
import ReplayPage from '@/pages/ReplayPage';
import SessionPage from '@/pages/SessionPage';

export default function App() {
  return (
    <TourProvider>
      <Tour />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<InboxPage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/sessions/:id" element={<SessionPage />} />
          <Route path="/sessions/:id/replay" element={<ReplayPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </TourProvider>
  );
}
