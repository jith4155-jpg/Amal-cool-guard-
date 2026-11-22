import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  const tabs = [
    {
      name: t('home'),
      path: '/',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
          <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5Z" />
        </svg>
      ),
    },
    {
      name: t('account'),
      path: '/account',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
    {
      name: t('orders'),
      path: '/orders',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-grow pb-16">
        <Outlet />
      </div>

      <footer className="fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-gray-200 z-[100] shadow-sm">
        <nav className="max-w-3xl mx-auto h-full grid grid-cols-3">
          {tabs.map(tab => {
            const active = location.pathname === tab.path;
            return (
              <button
                key={tab.path}
                type="button"
                onClick={() => navigate(tab.path)}
                className={`flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition whitespace-nowrap relative ${
                  active ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {active && (
                  <span className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-blue-600 rounded-b-full" />
                )}
                {tab.icon}
                <span className="text-[11px] leading-none">{tab.name}</span>
              </button>
            );
          })}
        </nav>
      </footer>
    </div>
  );
}
