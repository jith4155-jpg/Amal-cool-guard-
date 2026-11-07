import { Outlet, useNavigate, useLocation } from 'react-router-dom';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { name: 'Home', path: '/', icon: '🏠' },
    { name: 'Account', path: '/account', icon: '👤' },
    { name: 'Orders', path: '/orders', icon: '📦' },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-grow pb-16">
        <Outlet />
      </div>
      
      <footer className="fixed bottom-0 w-full bg-white border-t flex justify-around p-3 text-xs font-semibold text-gray-500 z-[100]">
        {tabs.map(tab => (
          <button 
            key={tab.name} 
            onClick={() => navigate(tab.path)} 
            className={location.pathname === tab.path ? 'text-blue-600' : ''}
          >
            <p className="text-xl">{tab.icon}</p>
            <p>{tab.name}</p>
          </button>
        ))}
      </footer>
    </div>
  );
}
