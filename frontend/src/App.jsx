import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ViewModeProvider } from './contexts/ViewModeContext';
import Layout from './components/Layout';
import SetupPage from './pages/SetupPage';
import LoginPage from './pages/LoginPage';
import { lazy, Suspense } from 'react';
const TasksPage     = lazy(() => import('./pages/TasksPage'));
const BuildingsPage = lazy(() => import('./pages/BuildingsPage'));
const RecordsPage   = lazy(() => import('./pages/RecordsPage'));
const UsersPage     = lazy(() => import('./pages/UsersPage'));
const ProfilePage   = lazy(() => import('./pages/ProfilePage'));
const CalendarPage  = lazy(() => import('./pages/CalendarPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const StatsPage     = lazy(() => import('./pages/StatsPage'));
const CommPage      = lazy(() => import('./pages/CommPage'));
const AppLogPage   = lazy(() => import('./pages/AppLogPage'));
import { useEffect, useState } from 'react';
import api from './utils/api';

function AppRoutes() {
  const { user, loading } = useAuth();
  const [setupNeeded, setSetupNeeded] = useState(null);

  useEffect(() => {
    api.get('/setup-needed').then(r => setSetupNeeded(r.data.needed)).catch(() => setSetupNeeded(false));
  }, []);

  if (loading || setupNeeded === null) {
    return <div className="loading-screen"><div className="spinner" /></div>;
  }

  if (setupNeeded) {
    return <Routes><Route path="*" element={<SetupPage onDone={() => setSetupNeeded(false)} />} /></Routes>;
  }

  if (!user) {
    return <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>;
  }

  return (
    <Layout>
      <Suspense fallback={<div className="loading-screen"><div className="spinner" /></div>}>
      <Routes>
        <Route path="/" element={<Navigate to="/tasks" />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/buildings" element={<BuildingsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/comm" element={<CommPage />} />
        <Route path="/applog" element={<AppLogPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/tasks" />} />
      </Routes>
      </Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ViewModeProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)' }
          }}
        />
      </BrowserRouter>
      </ViewModeProvider>
    </AuthProvider>
  );
}
