import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppStorefront from './AppStorefront';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import CustomerLogin from './components/CustomerLogin';
import AccountDashboard from './components/AccountDashboard';
import CategoriesView from './components/CategoriesView';
import LiveView from './components/LiveView';
import ProductDetails from './components/ProductDetails';
import OrdersView from './components/OrdersView';
import PromoterPortal from './components/PromoterPortal';
import Layout from './components/Layout';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';

export default function App() {
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    };
  }, []);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          {gmpQuotaExceeded && (
            <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
              <span>
                Google Maps Platform quota reached. If you are the app owner, visit{' '}
                <a
                  href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold text-amber-950 hover:text-amber-800"
                >
                  maps developer site
                </a>{' '}
                for instructions to update your account.
              </span>
            </div>
          )}
          <BrowserRouter>
            <Routes>
              {/* Standalone Admin routes without Customer Layout */}
              <Route path="/admin" element={<AdminLogin />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />

              {/* Standalone Promoter / Affiliate Portal */}
              <Route path="/promoter" element={<PromoterPortal />} />

              {/* Customer Storefront routes with Layout */}
              <Route element={<Layout />}>
                <Route path="/" element={<AppStorefront />} />
                <Route path="/categories" element={<CategoriesView />} />
                <Route path="/live" element={<LiveView />} />
                <Route path="/account" element={<AccountDashboard />} />
                <Route path="/orders" element={<OrdersView />} />
                <Route path="/product/:id" element={<ProductDetails />} />
                <Route path="/login" element={<CustomerLogin />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
