import { Route, Routes } from 'react-router-dom';
import AppShell from '@/components/AppShell';
import AdminPage from '@/pages/AdminPage';
import OperatorPage from '@/pages/OperatorPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<OperatorPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
    </Routes>
  );
}
