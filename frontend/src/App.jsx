import { Routes, Route, Navigate } from 'react-router-dom';

import LandingPage from './pages/landingpage/landingpage.jsx';
import AdminLayout from './pages/admin/adminlayout.jsx';
import OverviewPage from './pages/admin/overview/overviewpage.jsx';
import BandBookingsPage from './pages/admin/bandbookingpage/bandbooking.jsx';
import CoachSchedulesPage from './pages/admin/schedules/coachSchedules.jsx';
import PaymentsPage from './pages/admin/payments/paymentsPage.jsx';
import AnalyticsPage from './pages/admin/analytics/analyticsPage.jsx';
import CoachesPage from './pages/admin/coaches/coachesPage.jsx';
import PeoplePage from './pages/admin/people/peoplePage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route path="/admin" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
      <Route index element={<Navigate to="overview" replace />} />
      <Route path="overview" element={<OverviewPage />} />
      <Route path="band-bookings" element={<BandBookingsPage />} />
      <Route path="schedules" element={<CoachSchedulesPage />} />
      <Route path="payments" element={<PaymentsPage />} />
      <Route path="analytics" element={<AnalyticsPage />} />
      <Route path="coaches" element={<CoachesPage />} />
      <Route path="people" element={<PeoplePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}


