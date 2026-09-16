import { Route, Routes } from 'react-router-dom';
import AppShell from '@/components/AppShell';
import AdminPage from '@/pages/AdminPage';
import AuditPage from '@/pages/AuditPage';
import InboxPage from '@/pages/InboxPage';
import ReplayPage from '@/pages/ReplayPage';
import SessionPage from '@/pages/SessionPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<InboxPage />} />
        <Route path="/sessions/:id" element={<SessionPage />} />
        <Route path="/sessions/:id/replay" element={<ReplayPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
    </Routes>
  );
}
