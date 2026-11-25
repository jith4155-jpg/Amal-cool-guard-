import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, mapLiveConfigFromDb } from '../firebase';
import { getLiveConfig, saveLiveConfig } from '../utils/storeSync';
import { useLanguage } from '../context/LanguageContext';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const [isLiveActive, setIsLiveActive] = useState<boolean>(() => getLiveConfig().active);

  useEffect(() => {
    let isMounted = true;
    const syncLocal = () => {
      if (!isMounted) return;
      setIsLiveActive(getLiveConfig().active);
    };
    window.addEventListener('amal_store_updated', syncLocal);
    window.addEventListener('storage', syncLocal);

    const unsubLive = onSnapshot(
      doc(db, 'settings', 'live'),
      snap => {
        if (!isMounted || !snap.exists()) return;
        const mapped = saveLiveConfig(mapLiveConfigFromDb(snap.data()), false);
        setIsLiveActive(mapped.active);
      },
      () => {
        // Keep local live state gracefully if offline
      }
    );

    return () => {
      isMounted = false;
      unsubLive();
      window.removeEventListener('amal_store_updated', syncLocal);
      window.removeEventListener('storage', syncLocal);
    };
  }, []);

  const tabs = [
    {
      name: t('home'),
      path: '/',
      isLive: false,
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
          <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5Z" />
        </svg>
      ),
    },
    {
      name: t('categories') || 'Categories',
      path: '/categories',
      isLive: false,
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      name: t('live') || 'Live',
      path: '/live',
      isLive: true,
      icon: (
        <span className="relative inline-flex items-center justify-center">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
            <circle cx="12" cy="12" r="2.2" fill="currentColor" />
            <path d="M16.24 7.76a6 6 0 0 1 0 8.48" />
            <path d="M7.76 16.24a6 6 0 0 1 0-8.48" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
          </svg>
          {isLiveActive && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-rose-600 ring-2 ring-white animate-pulse"
            />
          )}
        </span>
      ),
    },
    {
      name: t('account'),
      path: '/account',
      isLive: false,
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
      isLive: false,
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
        <nav aria-label="Bottom Navigation" className="max-w-3xl mx-auto h-full grid grid-cols-5">
          {tabs.map(tab => {
            const active = location.pathname === tab.path;
            const activeColor = tab.isLive ? 'text-rose-600' : 'text-blue-600';
            const barColor = tab.isLive ? 'bg-rose-600' : 'bg-blue-600';
            const inactiveColor =
              tab.isLive && isLiveActive
                ? 'text-rose-600/85 hover:text-rose-700'
                : 'text-gray-500 hover:text-gray-900';

            return (
              <button
                key={tab.path}
                type="button"
                onClick={() => navigate(tab.path)}
                className={`min-w-0 px-0.5 flex flex-col items-center justify-center gap-0.5 font-bold transition whitespace-nowrap relative cursor-pointer ${
                  active ? activeColor : inactiveColor
                }`}
              >
                {active && (
                  <span className={`absolute top-0 left-1/4 right-1/4 h-0.5 ${barColor} rounded-b-full`} />
                )}
                {tab.icon}
                <span className="text-[10px] sm:text-[11px] leading-none truncate max-w-full">
                  {tab.name}
                </span>
              </button>
            );
          })}
        </nav>
      </footer>
    </div>
  );
}
