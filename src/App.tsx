import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppStorefront from './AppStorefront';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import CustomerLogin from './components/CustomerLogin';
import AccountDashboard from './components/AccountDashboard';
import ProductDetails from './components/ProductDetails';
import OrdersView from './components/OrdersView';
import Layout from './components/Layout';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<AppStorefront />} />
          <Route path="/account" element={<AccountDashboard />} />
          <Route path="/orders" element={<OrdersView />} />
          <Route path="/product/:id" element={<ProductDetails />} />
          <Route path="/login" element={<CustomerLogin />} />
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
