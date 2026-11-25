import { Product } from '../data/mockProducts';

export interface CategoryItem {
  id: string;
  name: string;
  imageUrl: string;
  visible: boolean;
  sortOrder: number;
  isDemo?: boolean;
  subTags?: string[];
  updatedAt?: string;
}

function encodeSvg(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface ArtTheme {
  bg1: string;
  bg2: string;
  accent: string;
  stroke: string;
  iconSvg: string;
}

const ART_THEMES: Record<string, ArtTheme> = {
  coat: {
    bg1: '#EFF6FF',
    bg2: '#DBEAFE',
    accent: '#2563EB',
    stroke: '#1E3A8A',
    iconSvg: `<path d="M24 22l12-8h24l12 8 8 18-10 4-4-10v42H30V34l-4 10-10-4 8-18z" fill="#3B82F6" stroke="#1E3A8A" stroke-width="2.5" stroke-linejoin="round"/><path d="M40 14l8 12 8-12" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/><line x1="48" y1="26" x2="48" y2="76" stroke="#DBEAFE" stroke-width="2.2" stroke-dasharray="3 3"/>`,
  },
  vest: {
    bg1: '#ECFEFF',
    bg2: '#CFFAFE',
    accent: '#0891B2',
    stroke: '#164E63',
    iconSvg: `<path d="M30 16h11l7 10 7-10h11l6 18-6 4v38H30V38l-6-4 6-18z" fill="#06B6D4" stroke="#164E63" stroke-width="2.5" stroke-linejoin="round"/><rect x="36" y="42" width="24" height="10" rx="3" fill="#ECFEFF" opacity="0.9"/><path d="M48 26v50" stroke="#ECFEFF" stroke-width="2"/>`,
  },
  sun: {
    bg1: '#FFFBEB',
    bg2: '#FEF3C7',
    accent: '#D97706',
    stroke: '#78350F',
    iconSvg: `<circle cx="48" cy="48" r="16" fill="#F59E0B" stroke="#78350F" stroke-width="2.5"/><g stroke="#D97706" stroke-width="3" stroke-linecap="round"><line x1="48" y1="16" x2="48" y2="24"/><line x1="48" y1="72" x2="48" y2="80"/><line x1="16" y1="48" x2="24" y2="48"/><line x1="72" y1="48" x2="80" y2="48"/><line x1="25" y1="25" x2="31" y2="31"/><line x1="65" y1="65" x2="71" y2="71"/><line x1="71" y1="25" x2="65" y2="31"/><line x1="31" y1="65" x2="25" y2="71"/></g><path d="M48 36l10 4v8c0 6-4.2 10.6-10 12.5C42.2 58.6 38 54 38 48v-8l10-4z" fill="#FEF3C7" stroke="#78350F" stroke-width="2"/>`,
  },
  tshirt: {
    bg1: '#ECFDF5',
    bg2: '#D1FAE5',
    accent: '#059669',
    stroke: '#064E3B',
    iconSvg: `<path d="M26 22l12-6c3 4 17 4 20 0l12 6 10 14-10 7-6-8v41H32V35l-6 8-10-7 10-14z" fill="#10B981" stroke="#064E3B" stroke-width="2.5" stroke-linejoin="round"/><path d="M39 17c3 5 15 5 18 0" fill="none" stroke="#ECFDF5" stroke-width="2.5"/>`,
  },
  shirt: {
    bg1: '#EEF2FF',
    bg2: '#E0E7FF',
    accent: '#4F46E5',
    stroke: '#312E81',
    iconSvg: `<path d="M26 22l14-6h16l14 6 8 18-10 5-4-11v42H32V34l-4 11-10-5 8-18z" fill="#6366F1" stroke="#312E81" stroke-width="2.5" stroke-linejoin="round"/><path d="M40 16l8 11 8-11" fill="#E0E7FF" stroke="#312E81" stroke-width="2"/><circle cx="48" cy="36" r="1.8" fill="#FFFFFF"/><circle cx="48" cy="48" r="1.8" fill="#FFFFFF"/><circle cx="48" cy="60" r="1.8" fill="#FFFFFF"/>`,
  },
  charger: {
    bg1: '#F5F3FF',
    bg2: '#EDE9FE',
    accent: '#7C3AED',
    stroke: '#4C1D95',
    iconSvg: `<rect x="33" y="28" width="30" height="36" rx="6" fill="#8B5CF6" stroke="#4C1D95" stroke-width="2.5"/><rect x="38" y="16" width="6" height="12" rx="1.5" fill="#DDD6FE" stroke="#4C1D95" stroke-width="2"/><rect x="52" y="16" width="6" height="12" rx="1.5" fill="#DDD6FE" stroke="#4C1D95" stroke-width="2"/><path d="M50 36l-7 10h6l-2 10 8-11h-6l1-9z" fill="#FDE047" stroke="#4C1D95" stroke-width="1.5" stroke-linejoin="round"/><path d="M48 64v14" stroke="#4C1D95" stroke-width="4" stroke-linecap="round"/>`,
  },
  electronics: {
    bg1: '#F0F9FF',
    bg2: '#E0F2FE',
    accent: '#0284C7',
    stroke: '#0C4A6E',
    iconSvg: `<rect x="20" y="24" width="56" height="38" rx="6" fill="#0EA5E9" stroke="#0C4A6E" stroke-width="2.5"/><rect x="26" y="30" width="44" height="26" rx="3" fill="#E0F2FE"/><path d="M36 72h24M48 62v10" stroke="#0C4A6E" stroke-width="3" stroke-linecap="round"/><circle cx="48" cy="43" r="6" fill="#0284C7"/>`,
  },
  electrical: {
    bg1: '#FEFCE8',
    bg2: '#FEF08A',
    accent: '#CA8A04',
    stroke: '#713F12',
    iconSvg: `<path d="M48 16c-11 0-19 8.5-19 19 0 7 3.8 12.6 8.5 16.5 2 1.7 3 4 3 6.5h15c0-2.5 1-4.8 3-6.5C63.2 47.6 67 42 67 35c0-10.5-8-19-19-19z" fill="#FACC15" stroke="#713F12" stroke-width="2.5"/><rect x="40" y="60" width="16" height="7" rx="2" fill="#EAB308" stroke="#713F12" stroke-width="2"/><rect x="42" y="69" width="12" height="6" rx="2" fill="#CA8A04" stroke="#713F12" stroke-width="2"/><path d="M43 35l5-7v6h5l-5 8v-7h-5z" fill="#FFFFFF"/>`,
  },
  gadget: {
    bg1: '#F1F5F9',
    bg2: '#E2E8F0',
    accent: '#334155',
    stroke: '#0F172A',
    iconSvg: `<rect x="28" y="20" width="40" height="56" rx="9" fill="#334155" stroke="#0F172A" stroke-width="2.5"/><rect x="33" y="27" width="30" height="40" rx="5" fill="#38BDF8"/><circle cx="48" cy="47" r="8" fill="#0F172A" opacity="0.25"/><path d="M43 47l4 4 7-8" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  watch: {
    bg1: '#F8FAFC',
    bg2: '#E2E8F0',
    accent: '#1E293B',
    stroke: '#0F172A',
    iconSvg: `<rect x="39" y="14" width="18" height="14" rx="3" fill="#475569" stroke="#0F172A" stroke-width="2"/><rect x="39" y="68" width="18" height="14" rx="3" fill="#475569" stroke="#0F172A" stroke-width="2"/><circle cx="48" cy="48" r="20" fill="#1E293B" stroke="#0F172A" stroke-width="2.5"/><circle cx="48" cy="48" r="15" fill="#F8FAFC"/><path d="M48 38v10l7 4" fill="none" stroke="#0F172A" stroke-width="2.5" stroke-linecap="round"/>`,
  },
  footwear: {
    bg1: '#FFF1F2',
    bg2: '#FFE4E6',
    accent: '#E11D48',
    stroke: '#881337',
    iconSvg: `<path d="M20 56c2-12 10-20 18-24l8 8c5 3 12 4 20 5 6 1 10 5 10 11v6H20v-6z" fill="#FB7185" stroke="#881337" stroke-width="2.5" stroke-linejoin="round"/><rect x="19" y="60" width="58" height="8" rx="3" fill="#FFFFFF" stroke="#881337" stroke-width="2"/><line x1="42" y1="38" x2="48" y2="44" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/><line x1="48" y1="35" x2="54" y2="41" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>`,
  },
  bag: {
    bg1: '#F0FDFA',
    bg2: '#CCFBF1',
    accent: '#0D9488',
    stroke: '#134E4A',
    iconSvg: `<path d="M38 24a10 10 0 0 1 20 0" fill="none" stroke="#134E4A" stroke-width="3"/><rect x="26" y="24" width="44" height="50" rx="12" fill="#14B8A6" stroke="#134E4A" stroke-width="2.5"/><rect x="33" y="44" width="30" height="20" rx="5" fill="#99F6E4" stroke="#134E4A" stroke-width="2"/><line x1="33" y1="36" x2="63" y2="36" stroke="#134E4A" stroke-width="2.5" stroke-linecap="round"/>`,
  },
  home: {
    bg1: '#FFF7ED',
    bg2: '#FFEDD5',
    accent: '#EA580C',
    stroke: '#7C2D12',
    iconSvg: `<path d="M18 46L48 20l30 26" fill="none" stroke="#7C2D12" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 42v32h44V42L48 23 26 42z" fill="#FB923C" stroke="#7C2D12" stroke-width="2.5" stroke-linejoin="round"/><rect x="41" y="52" width="14" height="22" rx="2" fill="#FFEDD5" stroke="#7C2D12" stroke-width="2"/>`,
  },
  appliances: {
    bg1: '#EFF6FF',
    bg2: '#E0E7FF',
    accent: '#2563EB',
    stroke: '#1E3A8A',
    iconSvg: `<rect x="26" y="18" width="44" height="60" rx="6" fill="#60A5FA" stroke="#1E3A8A" stroke-width="2.5"/><line x1="26" y1="32" x2="70" y2="32" stroke="#1E3A8A" stroke-width="2"/><circle cx="48" cy="54" r="13" fill="#EFF6FF" stroke="#1E3A8A" stroke-width="2.5"/><circle cx="48" cy="54" r="7" fill="#3B82F6"/><circle cx="36" cy="25" r="2" fill="#FFFFFF"/><circle cx="43" cy="25" r="2" fill="#FFFFFF"/>`,
  },
  beauty: {
    bg1: '#FDF2F8',
    bg2: '#FCE7F3',
    accent: '#DB2777',
    stroke: '#831843',
    iconSvg: `<rect x="34" y="34" width="28" height="40" rx="7" fill="#F472B6" stroke="#831843" stroke-width="2.5"/><rect x="41" y="20" width="14" height="14" rx="2" fill="#FBCFE8" stroke="#831843" stroke-width="2"/><path d="M48 44l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6-4.5-4 6-1 3-6z" fill="#FFFFFF"/>`,
  },
  sports: {
    bg1: '#F7FEE7',
    bg2: '#ECFCCB',
    accent: '#65A30D',
    stroke: '#365314',
    iconSvg: `<circle cx="48" cy="48" r="24" fill="#84CC16" stroke="#365314" stroke-width="2.5"/><path d="M29 34c10 8 10 20 0 28M67 34c-10 8-10 20 0 28M48 24v48M24 48h48" fill="none" stroke="#365314" stroke-width="2"/>`,
  },
  auto: {
    bg1: '#FEF2F2',
    bg2: '#FEE2E2',
    accent: '#DC2626',
    stroke: '#7F1D1D',
    iconSvg: `<path d="M24 54c0-16 11-28 26-28 14 0 24 10 24 24v8H24v-4z" fill="#EF4444" stroke="#7F1D1D" stroke-width="2.5" stroke-linejoin="round"/><path d="M48 34h21c2 4 3 8 3 12H48V34z" fill="#FEE2E2" stroke="#7F1D1D" stroke-width="2"/><circle cx="35" cy="64" r="7" fill="#334155" stroke="#0F172A" stroke-width="2"/><circle cx="63" cy="64" r="7" fill="#334155" stroke="#0F172A" stroke-width="2"/>`,
  },
  kerala: {
    bg1: '#ECFDF5',
    bg2: '#D1FAE5',
    accent: '#047857',
    stroke: '#064E3B',
    iconSvg: `<path d="M48 74c0-16 2-26 6-36" fill="none" stroke="#78350F" stroke-width="4" stroke-linecap="round"/><path d="M54 38c-12-8-24-4-30 4 10 2 20 2 30-4z" fill="#10B981" stroke="#064E3B" stroke-width="2"/><path d="M54 38c10-10 22-8 28 0-10 4-18 4-28 0z" fill="#10B981" stroke="#064E3B" stroke-width="2"/><path d="M54 38c-6-14 2-22 10-22 2 8-2 16-10 22z" fill="#34D399" stroke="#064E3B" stroke-width="2"/><circle cx="48" cy="74" r="10" fill="#FEF3C7" stroke="#064E3B" stroke-width="2"/>`,
  },
  accessories: {
    bg1: '#EFF6FF',
    bg2: '#DBEAFE',
    accent: '#1D4ED8',
    stroke: '#1E3A8A',
    iconSvg: `<path d="M48 18l22 8v18c0 14-9.5 25-22 30-12.5-5-22-16-22-30V26l22-8z" fill="#3B82F6" stroke="#1E3A8A" stroke-width="2.5" stroke-linejoin="round"/><path d="M38 47l7 7 14-14" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
};

export function getCategoryAutoImage(categoryName: string): string {
  const n = (categoryName || '').trim().toLowerCase();

  let theme: ArtTheme | null = null;
  if (n.includes('t-shirt') || n.includes('tshirt') || n.includes('tee') || n.includes('polo') || n.includes('ടീഷർട്ട്')) {
    theme = ART_THEMES.tshirt;
  } else if (n.includes('shirt') || n.includes('ഷർട്ട്') || n.includes('kurta') || n.includes('fashion')) {
    theme = ART_THEMES.shirt;
  } else if (n.includes('coat') || n.includes('jacket') || n.includes('rain') || n.includes('hoodie')) {
    theme = ART_THEMES.coat;
  } else if (n.includes('vest') || n.includes('ice') || n.includes('cool')) {
    theme = ART_THEMES.vest;
  } else if (n.includes('sun') || n.includes('uv') || n.includes('sleeve') || n.includes('visor')) {
    theme = ART_THEMES.sun;
  } else if (n.includes('charger') || n.includes('cable') || n.includes('adapter') || n.includes('ചാർജർ') || n.includes('mobile')) {
    theme = ART_THEMES.charger;
  } else if (n.includes('electronic') || n.includes('ഇലക്ട്രോണിക്') || n.includes('audio') || n.includes('speaker') || n.includes('laptop')) {
    theme = ART_THEMES.electronics;
  } else if (n.includes('electrical') || n.includes('ഇലക്ട്രിക്കൽ') || n.includes('bulb') || n.includes('light') || n.includes('fan')) {
    theme = ART_THEMES.electrical;
  } else if (n.includes('watch') || n.includes('clock')) {
    theme = ART_THEMES.watch;
  } else if (n.includes('gadget') || n.includes('smart')) {
    theme = ART_THEMES.gadget;
  } else if (n.includes('shoe') || n.includes('footwear') || n.includes('sandal') || n.includes('sneaker')) {
    theme = ART_THEMES.footwear;
  } else if (n.includes('bag') || n.includes('backpack') || n.includes('wallet')) {
    theme = ART_THEMES.bag;
  } else if (n.includes('appliance') || n.includes('fridge') || n.includes('washer')) {
    theme = ART_THEMES.appliances;
  } else if (n.includes('home') || n.includes('kitchen') || n.includes('furniture') || n.includes('വീട്')) {
    theme = ART_THEMES.home;
  } else if (n.includes('beauty') || n.includes('care') || n.includes('skin') || n.includes('cosmetic')) {
    theme = ART_THEMES.beauty;
  } else if (n.includes('sport') || n.includes('fitness') || n.includes('gym')) {
    theme = ART_THEMES.sports;
  } else if (n.includes('auto') || n.includes('bike') || n.includes('scooter') || n.includes('helmet') || n.includes('സ്കൂട്ട്')) {
    theme = ART_THEMES.auto;
  } else if (n.includes('kerala') || n.includes('special')) {
    theme = ART_THEMES.kerala;
  } else if (n.includes('accessor') || n.includes('shield') || n.includes('guard')) {
    theme = ART_THEMES.accessories;
  }

  if (theme) {
    return encodeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="192" height="192">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${theme.bg1}"/>
            <stop offset="100%" stop-color="${theme.bg2}"/>
          </linearGradient>
        </defs>
        <rect width="96" height="96" rx="22" fill="url(#g)"/>
        ${theme.iconSvg}
      </svg>`
    );
  }

  // Deterministic clean custom vector badge for any user-typed category name
  const palettes = [
    ['#EFF6FF', '#BFDBFE', '#1D4ED8'],
    ['#ECFDF5', '#A7F3D0', '#047857'],
    ['#FFF7ED', '#FED7AA', '#C2410C'],
    ['#F5F3FF', '#DDD6FE', '#6D28D9'],
    ['#FDF2F8', '#FBCFE8', '#BE185D'],
    ['#ECFEFF', '#A5F3FC', '#0E7490'],
  ];
  let hash = 0;
  for (let i = 0; i < n.length; i++) {
    hash = (hash * 31 + n.charCodeAt(i)) >>> 0;
  }
  const [p1, p2, accent] = palettes[hash % palettes.length];
  const initial = escapeXml((categoryName || 'A').trim().slice(0, 2).toUpperCase());

  return encodeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="192" height="192">
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${p1}"/>
          <stop offset="100%" stop-color="${p2}"/>
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="22" fill="url(#cg)"/>
      <circle cx="48" cy="44" r="22" fill="${accent}" opacity="0.14"/>
      <rect x="26" y="24" width="44" height="48" rx="12" fill="#FFFFFF" stroke="${accent}" stroke-width="2.5"/>
      <text x="48" y="55" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="${accent}">${initial}</text>
    </svg>`
  );
}

export function getProductAutoGallery(
  productName: string,
  categoryName: string,
  tagLabel = 'Amal Assured'
): string[] {
  const baseArt = getCategoryAutoImage(categoryName || productName);
  const safeTitle = escapeXml((productName || categoryName || 'Amal CoolGuard').slice(0, 22));
  const safeCat = escapeXml((categoryName || 'Featured').slice(0, 18));
  const safeTag = escapeXml((tagLabel || 'Amal Assured').slice(0, 18));

  const cardVariants = [
    { label: 'Front Showcase', bg: '#F8FAFC', chipBg: '#2563EB', chipText: '#FFFFFF' },
    { label: 'Cooling Layer View', bg: '#ECFEFF', chipBg: '#0891B2', chipText: '#FFFFFF' },
    { label: 'UV Protection Spec', bg: '#FFFBEB', chipBg: '#D97706', chipText: '#FFFFFF' },
    { label: 'Quality & Stitching', bg: '#ECFDF5', chipBg: '#059669', chipText: '#FFFFFF' },
    { label: 'Box & Dispatch Pack', bg: '#EEF2FF', chipBg: '#4F46E5', chipText: '#FFFFFF' },
  ];

  // Primary art + 4 multi-angle showcase cards (5 total photos per card)
  return cardVariants.map((variant, idx) => {
    if (idx === 0) return baseArt;
    return encodeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="480" height="480">
        <rect width="320" height="320" rx="24" fill="${variant.bg}"/>
        <rect x="20" y="20" width="280" height="280" rx="20" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
        <rect x="36" y="34" width="132" height="26" rx="8" fill="${variant.chipBg}"/>
        <text x="102" y="51" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="800" fill="${variant.chipText}">${escapeXml(variant.label)}</text>
        <text x="160" y="138" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="#0F172A">${safeTitle}</text>
        <text x="160" y="168" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#475569">${safeCat}</text>
        <rect x="78" y="198" width="164" height="34" rx="10" fill="#FEF3C7" stroke="#F59E0B" stroke-width="1.5"/>
        <text x="160" y="219" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="800" fill="#92400E">${safeTag}</text>
        <text x="160" y="274" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#64748B">Amal CoolGuard Official Store</text>
      </svg>`
    );
  });
}

export function slugifyCategoryId(name: string): string {
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (clean) return `cat_${clean.slice(0, 60)}`;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return `cat_custom_${hash}`;
}

export const STARTER_CATEGORIES: CategoryItem[] = [
  { id: 'cat_coats', name: 'Coats', subTags: ['Solar Overcoat', 'Riding Coat', 'Long Heat Coat'], visible: true, sortOrder: 1, isDemo: true },
  { id: 'cat_vests', name: 'Vests', subTags: ['Ice-Mesh Vest', 'Delivery Rider Vest', 'Reflective Vest'], visible: true, sortOrder: 2, isDemo: true },
  { id: 'cat_sun_protection', name: 'Sun Protection', subTags: ['UV Arm Sleeves', 'Neck Gaiters', 'Face Shield'], visible: true, sortOrder: 3, isDemo: true },
  { id: 'cat_shirts', name: 'Shirts', subTags: ['Linen Comfort', 'Summer Cotton', 'Formal Wear'], visible: true, sortOrder: 4, isDemo: true },
  { id: 'cat_tshirts', name: 'T-Shirts', subTags: ['CoolDry Polo', 'Sports Tee', 'UV Round Neck'], visible: true, sortOrder: 5, isDemo: true },
  { id: 'cat_mobile_chargers', name: 'Mobile Chargers', subTags: ['65W GaN Charger', 'Type-C Cable', 'Car Fast Charger'], visible: true, sortOrder: 6, isDemo: true },
  { id: 'cat_electronics', name: 'Electronics', subTags: ['Mini Cooling Fans', 'Power Banks', 'Audio'], visible: true, sortOrder: 7, isDemo: true },
  { id: 'cat_electrical', name: 'Electrical', subTags: ['LED Bulbs', 'Extension Boards', 'Emergency Lights'], visible: true, sortOrder: 8, isDemo: true },
  { id: 'cat_smart_gadgets', name: 'Smart Gadgets', subTags: ['Neck Fans', 'Smart Bands', 'USB Lights'], visible: true, sortOrder: 9, isDemo: true },
  { id: 'cat_watches', name: 'Watches', subTags: ['Sport Digital', 'Classic Analog', 'Fitness Tracker'], visible: true, sortOrder: 10, isDemo: true },
  { id: 'cat_footwear', name: 'Footwear', subTags: ['Breathable Sneakers', 'Walking Shoes', 'Sandals'], visible: true, sortOrder: 11, isDemo: true },
  { id: 'cat_bags', name: 'Bags & Backpacks', subTags: ['Rider Backpacks', 'Laptop Bags', 'Travel Sling'], visible: true, sortOrder: 12, isDemo: true },
  { id: 'cat_home_kitchen', name: 'Home & Kitchen', subTags: ['Flasks & Bottles', 'Cooling Towels', 'Organizers'], visible: true, sortOrder: 13, isDemo: true },
  { id: 'cat_appliances', name: 'Appliances', subTags: ['Air Coolers', 'Electric Kettles', 'Steam Irons'], visible: true, sortOrder: 14, isDemo: true },
  { id: 'cat_beauty_care', name: 'Beauty & Care', subTags: ['Sunscreen SPF 50', 'Cooling Gel', 'Grooming'], visible: true, sortOrder: 15, isDemo: true },
  { id: 'cat_sports_fitness', name: 'Sports & Fitness', subTags: ['Gym Gloves', 'Hydration Packs', 'Cap & Visors'], visible: true, sortOrder: 16, isDemo: true },
  { id: 'cat_auto_accessories', name: 'Auto Accessories', subTags: ['Bike Seat Cover', 'Helmet Liner', 'Scooter Cover'], visible: true, sortOrder: 17, isDemo: true },
  { id: 'cat_kerala_special', name: 'Kerala Special', subTags: ['Monsoon + Heat Kit', 'Wayanad Edition', 'Rider Combo'], visible: true, sortOrder: 18, isDemo: true },
].map(cat => ({
  ...cat,
  imageUrl: getCategoryAutoImage(cat.name),
}));

export const STARTER_DEMO_PRODUCTS: Product[] = [
  {
    id: 'demo_amal_coat_1',
    name: 'Amal CoolGuard UV Sun Shield Overcoat',
    category: 'Coats',
    price: 2499,
    discountPrice: 1499,
    deliveryCharge: 0,
    estimatedDeliveryDays: '3-5 Days',
    description:
      'Reflective UPF 50+ heat-shield riding overcoat engineered for Kerala summer sun. Breathable micro-vent fabric lowers inner warmth during daily rides.',
    imageUrl: getCategoryAutoImage('Coats'),
    galleryImages: getProductAutoGallery('Amal UV Sun Overcoat', 'Coats', 'Best Seller'),
    tag: 'Best Seller',
    placement: 'banner',
    visible: true,
    isDemo: true,
    rating: 4.9,
    reviewsCount: 128,
    stock: 40,
    gstPercent: 0,
    features: ['UPF 50+ Sun Shield', 'Heat Reflective Shell', 'Breathable Mesh Lining', 'Washable & Lightweight'],
  },
  {
    id: 'demo_amal_vest_1',
    name: 'Amal Ice-Mesh Cooling Rider Vest',
    category: 'Vests',
    price: 1999,
    discountPrice: 1199,
    deliveryCharge: 0,
    estimatedDeliveryDays: '2-4 Days',
    description:
      'Lightweight cooling vest designed for delivery partners, outdoor workers, and bikers. Evaporative cooling panels keep your body fresh under harsh noon heat.',
    imageUrl: getCategoryAutoImage('Vests'),
    galleryImages: getProductAutoGallery('Ice-Mesh Cooling Vest', 'Vests', 'Min. 40% Off'),
    tag: 'Min. 40% Off',
    placement: 'deals',
    visible: true,
    isDemo: true,
    rating: 4.8,
    reviewsCount: 94,
    stock: 35,
    gstPercent: 0,
    features: ['Rapid Cooling Fabric', 'Adjustable Side Straps', 'Night Reflective Strips', 'Sweat Wicking'],
  },
  {
    id: 'demo_sun_sleeves_1',
    name: 'CoolGuard UV Arm Sleeves & Neck Gaiter Combo',
    category: 'Sun Protection',
    price: 799,
    discountPrice: 399,
    deliveryCharge: 0,
    estimatedDeliveryDays: '2-4 Days',
    description:
      '4-way stretch UV arm sleeves paired with a breathable ice-silk neck gaiter mask to shield arms and face from tanning and dust.',
    imageUrl: getCategoryAutoImage('Sun Protection'),
    galleryImages: getProductAutoGallery('UV Sleeves & Gaiter', 'Sun Protection', 'Hot Deal'),
    tag: 'Hot Deal',
    placement: 'deals',
    visible: true,
    isDemo: true,
    rating: 4.7,
    reviewsCount: 210,
    stock: 80,
    gstPercent: 0,
    features: ['Ice-Silk Cool Touch', 'UPF 50+ UV Block', 'Anti-Slip Cuff', 'Unisex Free Size'],
  },
  {
    id: 'demo_charger_1',
    name: 'Amal Volt 65W GaN Super-Fast Mobile Charger',
    category: 'Mobile Chargers',
    price: 1899,
    discountPrice: 999,
    deliveryCharge: 0,
    estimatedDeliveryDays: '3-5 Days',
    description:
      'Dual-port Type-C + USB-A 65W fast mobile adapter with surge protection and braided fast-charge cable included.',
    imageUrl: getCategoryAutoImage('Mobile Chargers'),
    galleryImages: getProductAutoGallery('Volt 65W Fast Charger', 'Mobile Chargers', 'New Launch'),
    tag: 'New Launch',
    placement: 'spotlight',
    visible: true,
    isDemo: true,
    rating: 4.8,
    reviewsCount: 64,
    stock: 50,
    gstPercent: 0,
    features: ['65W PD Fast Charge', 'Over-Heat Protection', 'Type-C Cable Included', '1 Year Warranty'],
  },
  {
    id: 'demo_tshirt_1',
    name: 'CoolDry Breathable UV Summer T-Shirt',
    category: 'T-Shirts',
    price: 999,
    discountPrice: 499,
    deliveryCharge: 0,
    estimatedDeliveryDays: '3-5 Days',
    description:
      'Quick-dry moisture-wicking summer T-shirt tailored for humid tropical weather. Stays airy and odor-free all day.',
    imageUrl: getCategoryAutoImage('T-Shirts'),
    galleryImages: getProductAutoGallery('CoolDry Summer Tee', 'T-Shirts', 'Min. 50% Off'),
    tag: 'Min. 50% Off',
    placement: 'spotlight',
    visible: true,
    isDemo: true,
    rating: 4.6,
    reviewsCount: 152,
    stock: 60,
    gstPercent: 0,
    features: ['Quick-Dry Knit', 'Zero-Sweat Patches', 'Soft Collar', 'Colorfast Wash'],
  },
  {
    id: 'demo_fan_1',
    name: 'Hands-Free Dual Bladeless Cooling Neck Fan',
    category: 'Electronics',
    price: 1699,
    discountPrice: 899,
    deliveryCharge: 0,
    estimatedDeliveryDays: '3-5 Days',
    description:
      'Rechargeable USB Type-C bladeless neck fan with 3-speed 360-degree cooling airflow and long 8-hour battery backup.',
    imageUrl: getCategoryAutoImage('Electronics'),
    galleryImages: getProductAutoGallery('Bladeless Neck Fan', 'Electronics', 'Summer Pick'),
    tag: 'Summer Pick',
    placement: 'deals',
    visible: true,
    isDemo: true,
    rating: 4.7,
    reviewsCount: 83,
    stock: 30,
    gstPercent: 0,
    features: ['360° Cool Airflow', '4000mAh Battery', 'Whisper Quiet Motor', 'Type-C Charging'],
  },
  {
    id: 'demo_shirt_1',
    name: 'AeroLinen Crisp Comfort Casual Shirt',
    category: 'Shirts',
    price: 1499,
    discountPrice: 749,
    deliveryCharge: 0,
    estimatedDeliveryDays: '3-5 Days',
    description:
      'Airy cotton-linen blend half & full sleeve casual shirt crafted for maximum comfort in warm weather.',
    imageUrl: getCategoryAutoImage('Shirts'),
    galleryImages: getProductAutoGallery('AeroLinen Casual Shirt', 'Shirts', 'Value Pick'),
    tag: 'Value Pick',
    placement: 'grid',
    visible: true,
    isDemo: true,
    rating: 4.5,
    reviewsCount: 41,
    stock: 45,
    gstPercent: 0,
    features: ['Cotton-Linen Blend', 'Easy Iron Finish', 'Breathable Weave', 'Regular Comfort Fit'],
  },
  {
    id: 'demo_watch_1',
    name: 'Pulse Pro Waterproof Sport Smart Watch',
    category: 'Watches',
    price: 2999,
    discountPrice: 1299,
    deliveryCharge: 0,
    estimatedDeliveryDays: '3-5 Days',
    description:
      'Bright outdoor sunlight-readable display watch with step counter, call alerts, and water resistance.',
    imageUrl: getCategoryAutoImage('Watches'),
    galleryImages: getProductAutoGallery('Pulse Pro Watch', 'Watches', 'Trending'),
    tag: 'Trending',
    placement: 'spotlight',
    visible: true,
    isDemo: true,
    rating: 4.7,
    reviewsCount: 77,
    stock: 25,
    gstPercent: 0,
    features: ['Sunlight HD Display', 'IP68 Waterproof', '7-Day Battery', 'Silicone Comfort Strap'],
  },
];
