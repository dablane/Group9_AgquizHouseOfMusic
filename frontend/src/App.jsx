import { Routes, Route, Navigate } from 'react-router-dom';

import LandingPage from './pages/landingpage/landingpage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
