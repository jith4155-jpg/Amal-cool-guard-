import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  const tabs = [
    { name: t('home'), path: '/', icon: '🏠' },
    { name: t('account'), path: '/account', icon: '👤' },
    { name: t('orders'), path: '/orders', icon: '📦' },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-grow pb-16">
        <Outlet />
      </div>
      
      <footer className="fixed bottom-0 w-full bg-white border-t flex justify-around p-2.5 text-xs font-semibold text-gray-500 z-[100]">
        {tabs.map(tab => (
          <button 
            key={tab.path} 
            onClick={() => navigate(tab.path)} 
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition ${
              location.pathname === tab.path ? 'text-blue-600 font-extrabold' : 'hover:text-gray-900'
            }`}
          >
            <span className="text-xl leading-none mb-1">{tab.icon}</span>
            <span className="text-[11px] leading-tight">{tab.name}</span>
          </button>
        ))}
      </footer>
    </div>
  );
}
