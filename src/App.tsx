import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppStorefront from './AppStorefront';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import CustomerLogin from './components/CustomerLogin';
import AccountDashboard from './components/AccountDashboard';
import ProductDetails from './components/ProductDetails';
import OrdersView from './components/OrdersView';
import PromoterPortal from './components/PromoterPortal';
import Layout from './components/Layout';
import { LanguageProvider } from './context/LanguageContext';

export default function App() {
  return (
    <LanguageProvider>
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
            <Route path="/account" element={<AccountDashboard />} />
            <Route path="/orders" element={<OrdersView />} />
            <Route path="/product/:id" element={<ProductDetails />} />
            <Route path="/login" element={<CustomerLogin />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}
