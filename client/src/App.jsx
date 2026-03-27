import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';

import Workers from './pages/Workers';
import TimeEntries from './pages/TimeEntries';
import SickLeave from './pages/SickLeave';
import Vacation from './pages/Vacation';
import Reports from './pages/Reports';
import Properties from './pages/Properties';
import DailyOperations from './pages/DailyOperations';
import ExtraJobs from './pages/ExtraJobs';
import GarbageSchedule from './pages/GarbageSchedule';
import CommandCenter from './pages/CommandCenter';
import Analytics from './pages/Analytics';
import HourBalances from './pages/HourBalances';
import WeeklyPlanner from './pages/WeeklyPlanner';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <ThemeProvider>
    <LanguageProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<CommandCenter />} />
            <Route path="command-center" element={<CommandCenter />} />

            <Route path="workers" element={<Workers />} />
            <Route path="time-entries" element={<TimeEntries />} />
            <Route path="sick-leave" element={<SickLeave />} />
            <Route path="vacation" element={<Vacation />} />
            <Route path="hour-balances" element={<HourBalances />} />
            <Route path="reports" element={<Reports />} />
            <Route path="properties" element={<Properties />} />
            <Route path="daily-operations" element={<DailyOperations />} />
            <Route path="weekly-planner" element={<WeeklyPlanner />} />
            <Route path="extra-jobs" element={<ExtraJobs />} />
            <Route path="garbage" element={<GarbageSchedule />} />
            <Route path="analytics" element={<Analytics />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </LanguageProvider>
    </ThemeProvider>
  );
}
