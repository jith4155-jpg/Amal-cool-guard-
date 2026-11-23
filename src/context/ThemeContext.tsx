import React, { createContext, useContext, useEffect, useState, useRef } from 'react';

export type AppTheme = 'dark' | 'light' | 'midnight' | 'forest' | 'warm';

export interface ThemeOption {
  id: AppTheme;
  name: string;
  shortName: string;
  icon: string;
  swatch: string;
  ring: string;
  metaColor: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'dark',
    name: 'Dark Night',
    shortName: 'Dark',
    icon: '🌑',
    swatch: '#111827',
    ring: '#3b82f6',
    metaColor: '#090d16',
  },
  {
    id: 'light',
    name: 'Clean White',
    shortName: 'White',
    icon: '☀️',
    swatch: '#f8fafc',
    ring: '#2563eb',
    metaColor: '#ffffff',
  },
  {
    id: 'midnight',
    name: 'Midnight Blue',
    shortName: 'Midnight',
    icon: '🌌',
    swatch: '#0f213d',
    ring: '#38bdf8',
    metaColor: '#050e1d',
  },
  {
    id: 'forest',
    name: 'Dark Emerald',
    shortName: 'Forest',
    icon: '🌲',
    swatch: '#0d2821',
    ring: '#10b981',
    metaColor: '#061411',
  },
  {
    id: 'warm',
    name: 'Warm Night',
    shortName: 'Warm',
    icon: '🕯️',
    swatch: '#241c16',
    ring: '#f59e0b',
    metaColor: '#140f0b',
  },
];

const THEME_STORAGE_KEY = 'amal_app_theme';

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  currentThemeOption: ThemeOption;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
  currentThemeOption: THEME_OPTIONS[0],
});

function readStoredTheme(): AppTheme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as AppTheme | null;
    if (saved && THEME_OPTIONS.some(t => t.id === saved)) {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'light';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AppTheme>(() => readStoredTheme());

  const applyThemeToDom = (targetTheme: AppTheme) => {
    try {
      document.documentElement.setAttribute('data-theme', targetTheme);
      const opt = THEME_OPTIONS.find(t => t.id === targetTheme) || THEME_OPTIONS[0];
      let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
      }
      meta.content = opt.metaColor;
    } catch {
      // ignore DOM errors
    }
  };

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        const next = e.newValue as AppTheme;
        if (THEME_OPTIONS.some(t => t.id === next)) {
          setThemeState(next);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = (nextTheme: AppTheme) => {
    setThemeState(nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // ignore
    }
    applyThemeToDom(nextTheme);
  };

  const currentThemeOption = THEME_OPTIONS.find(t => t.id === theme) || THEME_OPTIONS[0];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, currentThemeOption }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export const ThemeSwitcher: React.FC<{ compact?: boolean; className?: string }> = ({
  compact = false,
  className = '',
}) => {
  const { theme, setTheme, currentThemeOption } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative inline-block shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        title={`Theme: ${currentThemeOption.name}`}
        aria-label="Change Color Theme"
        className="h-9 flex items-center gap-1.5 bg-white border border-gray-200 text-gray-800 text-xs font-bold px-2.5 rounded-lg shadow-xs hover:border-blue-400 transition cursor-pointer whitespace-nowrap"
      >
        <span
          className="w-3.5 h-3.5 rounded-full border border-gray-400/50 shrink-0"
          style={{ backgroundColor: currentThemeOption.swatch }}
        />
        {!compact && <span>{currentThemeOption.shortName}</span>}
        <span className="text-[9px] opacity-60">▼</span>
      </button>

      {open && (
        <div className="theme-popover absolute right-0 mt-2 w-44 rounded-xl shadow-2xl border border-gray-200 bg-white p-1.5 z-[300] space-y-0.5">
          <p className="text-[10px] font-bold text-gray-500 uppercase px-2.5 py-1 tracking-wide">
            Color Theme
          </p>
          {THEME_OPTIONS.map(opt => {
            const active = opt.id === theme;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setTheme(opt.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold transition ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-800 hover:bg-gray-100'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-white/40 shrink-0 shadow-xs"
                    style={{ backgroundColor: opt.swatch }}
                  />
                  <span>{opt.name}</span>
                </span>
                {active && <span className="text-[11px]">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
