import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppStorefront from './AppStorefront';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';

export default function App() {
  return (
    <BrowserRouter basename="/Amal-cool-guard-/">
      <Routes>
        <Route path="/" element={<AppStorefront />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
