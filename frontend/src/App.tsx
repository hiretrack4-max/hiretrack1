import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequireAuth } from '@/components/RequireAuth';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import JobsList from '@/pages/jobs/JobsList';
import JobDetail from '@/pages/jobs/JobDetail';
import CandidatesList from '@/pages/candidates/CandidatesList';
import CandidateDetail from '@/pages/candidates/CandidateDetail';
import CandidateCreate from '@/pages/candidates/CandidateCreate';
import Reports from '@/pages/Reports';
import Search from '@/pages/Search';
import Notifications from '@/pages/Notifications';
import RecycleBin from '@/pages/RecycleBin';
import NotFound from '@/pages/NotFound';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/jobs" element={<JobsList />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/candidates" element={<CandidatesList />} />
          <Route path="/candidates/new" element={<CandidateCreate />} />
          <Route path="/candidates/upload" element={<Navigate to="/candidates/new" replace />} />
          <Route path="/candidates/:id" element={<CandidateDetail />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/search" element={<Search />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/recycle-bin" element={<RecycleBin />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
