import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

export type Language = 'en' | 'ml' | 'hi' | 'ta';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    brandName: 'Amal Coolguard',
    brandSubtitle: 'Sun Protection',
    tagline: 'Heat Protection Gear • Kerala',
    searchPlaceholder: 'Search cooling vests, coats, sun gear...',
    allProducts: 'All Products',
    featuredTitle: 'Featured Cooling Vests & Coats',
    productsCount: 'Items',
    orderNow: 'Order Now',
    viewDetails: 'View Details',
    freeDelivery: 'Free Delivery',
    specialDiscount: 'off',
    heroBadge: 'Official Sun Protection Gear',
    heroTitle: 'Amal Coolguard',
    heroDesc: 'Sun Protection Cooling Gear • Engineered for Harsh Indian Sunlight',
    heatBlock: '90% Heat Block',
    waterproof: 'Waterproof',
    login: 'Login',
    logout: 'Logout',
    account: 'Account',
    orders: 'Orders',
    home: 'Home',
    categories: 'Categories',
    live: 'Live',
    wishlist: 'Wishlist',
    helpCenter: 'Help Center',
    coupons: 'Coupons',
    deliveryAddress: 'Delivery Address',
    edit: 'Edit',
    save: 'Save Address',
    close: 'Close',
    price: 'Price',
    shippingLabel: 'Shipping Label',
    customerName: 'Full Name',
    mobileNumber: 'Mobile Number',
    pincode: 'Pincode',
    paymentMethod: 'Payment Method',
    payWithUPI: 'Pay with UPI (GPay / PhonePe / Paytm)',
    cashOnDelivery: 'Cash on Delivery (COD)',
    myAccount: 'My Account',
    myOrders: 'My Orders',
    profileLocked: 'Sign In to View Profile',
    profileLockedDesc: 'Sign in with your Gmail account to securely view your profile, saved address, and orders.',
    ordersLockedDesc: 'Sign in with your Gmail account to view your orders and live delivery tracking.',
    loginRequiredBook: 'Sign in with Gmail to place an order',
    tapToZoom: 'Tap to Zoom',
  },
  ml: {
    brandName: 'Amal Coolguard',
    brandSubtitle: 'അമൽ കൂൾഗാർഡ്',
    tagline: 'ഹീറ്റ് പ്രൊട്ടക്ഷൻ ഗിയർ • കേരളം',
    searchPlaceholder: 'കൂളിംഗ് കോട്ടുകൾ, വെസ്റ്റുകൾ തിരയുക...',
    allProducts: 'എല്ലാ ഉൽപ്പന്നങ്ങളും',
    featuredTitle: 'ഹീറ്റ് പ്രൊട്ടക്ഷൻ കോട്ടുകളും വെസ്റ്റുകളും',
    productsCount: 'ഉൽപ്പന്നങ്ങൾ',
    orderNow: 'ഓർഡർ ചെയ്യുക',
    viewDetails: 'വിശദാംശങ്ങൾ',
    freeDelivery: 'സൗജന്യ ഡെലിവറി',
    specialDiscount: 'കിഴിവ്',
    heroBadge: 'ഔദ്യോഗിക സൺ പ്രൊട്ടക്ഷൻ ഗിയർ',
    heroTitle: 'Amal Coolguard',
    heroDesc: 'കടുത്ത വെയിലിനെ പ്രതിരോധിക്കുന്ന കൂളിംഗ് കോട്ടുകളും വെസ്റ്റുകളും',
    heatBlock: '90% ചൂട് തടയുന്നു',
    waterproof: 'വാട്ടർപ്രൂഫ്',
    login: 'ലോഗിൻ',
    logout: 'ലോഗൗട്ട്',
    account: 'അക്കൗണ്ട്',
    orders: 'ഓർഡറുകൾ',
    home: 'ഹോം',
    categories: 'വിഭാഗങ്ങൾ',
    live: 'ലൈവ്',
    wishlist: 'വിഷ്‌ലിസ്റ്റ്',
    helpCenter: 'സഹായ കേന്ദ്രം',
    coupons: 'കൂപ്പണുകൾ',
    deliveryAddress: 'ഡെലിവറി വിലാസം',
    edit: 'എഡിറ്റ്',
    save: 'സേവ് ചെയ്യുക',
    close: 'അടയ്ക്കുക',
    price: 'വില',
    shippingLabel: 'ഷിപ്പിംഗ് ലേബൽ',
    customerName: 'പേര്',
    mobileNumber: 'മൊബൈൽ നമ്പർ',
    pincode: 'പിൻകോഡ്',
    paymentMethod: 'പേയ്‌മെന്റ് രീതി',
    payWithUPI: 'UPI വഴി പണം നൽകുക',
    cashOnDelivery: 'ക്യാഷ് ഓൺ ഡെലിവറി',
    myAccount: 'എന്റെ അക്കൗണ്ട്',
    myOrders: 'എന്റെ ഓർഡറുകൾ',
    profileLocked: 'പ്രൊഫൈൽ കാണാൻ ലോഗിൻ ചെയ്യുക',
    profileLockedDesc: 'നിങ്ങളുടെ സ്വന്തം പ്രൊഫൈലും ഓർഡറുകളും സുരക്ഷിതമായി കാണാൻ Gmail അക്കൗണ്ട് ഉപയോഗിച്ച് ലോഗിൻ ചെയ്യുക.',
    ordersLockedDesc: 'നിങ്ങളുടെ ഓർഡറുകളും ട്രാക്കിംഗ് വിവരങ്ങളും കാണാൻ Gmail അക്കൗണ്ട് വഴി ലോഗിൻ ചെയ്യുക.',
    loginRequiredBook: 'ഓർഡർ ബുക്ക് ചെയ്യാൻ Gmail ലോഗിൻ ചെയ്യുക',
    tapToZoom: 'സൂം ചെയ്തു കാണാം',
  },
  hi: {
    brandName: 'Amal Coolguard',
    brandSubtitle: 'अमल कूलगार्ड',
    tagline: 'हीट प्रोटेक्शन गियर • केरल',
    searchPlaceholder: 'कूलिंग वेस्ट और कोट खोजें...',
    allProducts: 'सभी उत्पाद',
    featuredTitle: 'विशेष कूलिंग वेस्ट और कोट',
    productsCount: 'उत्पाद',
    orderNow: 'अभी ऑर्डर करें',
    viewDetails: 'विवरण देखें',
    freeDelivery: 'फ्री डिलीवरी',
    specialDiscount: 'छूट',
    heroBadge: 'आधिकारिक धूप सुरक्षा गियर',
    heroTitle: 'Amal Coolguard',
    heroDesc: 'तेज धूप से सुरक्षा • बाइक राइडर्स और कामगारों के लिए हीट रिफ्लेक्टिव कोट',
    heatBlock: '90% गर्मी से बचाव',
    waterproof: 'वाटरप्रूफ',
    login: 'लॉग इन',
    logout: 'लॉग आउट',
    account: 'खाता',
    orders: 'आदेश',
    home: 'होम',
    categories: 'श्रेणियाँ',
    live: 'लाइव',
    wishlist: 'विशलिस्ट',
    helpCenter: 'सहायता केंद्र',
    coupons: 'कूपन',
    deliveryAddress: 'वितरण का पता',
    edit: 'संपादित करें',
    save: 'सहेजें',
    close: 'बंद करें',
    price: 'मूल्य',
    shippingLabel: 'शिपिंग लेबल',
    customerName: 'नाम',
    mobileNumber: 'मोबाइल नंबर',
    pincode: 'पिनकोड',
    paymentMethod: 'भुगतान विधि',
    payWithUPI: 'UPI से भुगतान करें',
    cashOnDelivery: 'कैश ऑन डिलीवरी',
    myAccount: 'मेरा खाता',
    myOrders: 'मेरे ऑर्डर',
    profileLocked: 'प्रोफ़ाइल देखने के लिए लॉगिन करें',
    profileLockedDesc: 'अपनी प्रोफ़ाइल और ऑर्डर देखने के लिए अपने Gmail खाते से साइन इन करें।',
    ordersLockedDesc: 'अपने ऑर्डर और ट्रैकिंग देखने के लिए अपने Gmail खाते से साइन इन करें।',
    loginRequiredBook: 'ऑर्डर करने के लिए Gmail से लॉगिन करें',
    tapToZoom: 'ज़ूम करने के लिए टैप करें',
  },
  ta: {
    brandName: 'Amal Coolguard',
    brandSubtitle: 'அமல் கூல்கார்ட்',
    tagline: 'வெப்ப பாதுகாப்பு கியர் • கேரளா',
    searchPlaceholder: 'கூலிங் கோட்கள் மற்றும் ஆடைகளைத் தேடுங்கள்...',
    allProducts: 'அனைத்து பொருட்கள்',
    featuredTitle: 'சிறப்பு கூலிங் கோட்கள் & வெஸ்ட்கள்',
    productsCount: 'பொருட்கள்',
    orderNow: 'இப்போதே ஆர்டர் செய்',
    viewDetails: 'விவரங்களைப் பார்',
    freeDelivery: 'இலவச டெலிவரி',
    specialDiscount: 'தள்ளுபடி',
    heroBadge: 'அதிகாரப்பூர்வ சூரிய பாதுகாப்பு கியர்',
    heroTitle: 'Amal Coolguard',
    heroDesc: 'கடுமையான வெயிலை வெல்லுங்கள் • பைக் ஓட்டுநர்களுக்கான சிறப்பு கோட்',
    heatBlock: '90% வெப்பத் தடுப்பு',
    waterproof: 'நீர்ப்புகா',
    login: 'உள்நுழைவு',
    logout: 'வெளியேறு',
    account: 'கணக்கு',
    orders: 'ஆர்டர்கள்',
    home: 'முகப்பு',
    categories: 'வகைகள்',
    live: 'லைவ்',
    wishlist: 'விருப்பப்பட்டியல்',
    helpCenter: 'உதவி மையம்',
    coupons: 'கூப்பன்கள்',
    deliveryAddress: 'டெலிவரி முகவரி',
    edit: 'திருத்து',
    save: 'சேமி',
    close: 'மூடு',
    price: 'விலை',
    shippingLabel: 'ஷிப்பிங் லேபிள்',
    customerName: 'பெயர்',
    mobileNumber: 'மொபைல் எண்',
    pincode: 'பின்கோட்',
    paymentMethod: 'பணம் செலுத்தும் முறை',
    payWithUPI: 'UPI மூலம் பணம் செலுத்துங்கள்',
    cashOnDelivery: 'கேஷ் ஆன் டெலிவரி',
    myAccount: 'என் கணக்கு',
    myOrders: 'என் ஆர்டர்கள்',
    profileLocked: 'சுயவிவரத்தைக் காண உள்நுழையவும்',
    profileLockedDesc: 'உங்கள் சுயவிவரம் மற்றும் ஆர்டர்களைக் காண உங்கள் Gmail கணக்கில் உள்நுழையவும்.',
    ordersLockedDesc: 'உங்கள் ஆர்டர்கள் மற்றும் டிராக்கிங்கைக் காண Gmail கணக்கில் உள்நுழையவும்.',
    loginRequiredBook: 'ஆர்டர் செய்ய Gmail மூலம் உள்நுழையவும்',
    tapToZoom: 'பெரிதாக்க தட்டவும்',
  },
};

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key: string) => key,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Always open in English on every fresh visit; switches only when changed by the user in-session
  const [lang, setLangState] = useState<Language>('en');

  const setLang = (newLang: Language) => {
    if (['en', 'ml', 'hi', 'ta'].includes(newLang)) {
      setLangState(newLang);
    }
  };

  const t = (key: string): string => {
    return translations[lang]?.[key] || translations['en']?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);

export const LanguageSelector: React.FC<{ className?: string; compact?: boolean }> = ({
  className = '',
  compact = false,
}) => {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const languageOptions: { code: Language; short: string; name: string }[] = [
    { code: 'en', short: 'EN', name: 'English' },
    { code: 'ml', short: 'ML', name: 'മലയാളം' },
    { code: 'hi', short: 'HI', name: 'हिन्दी' },
    { code: 'ta', short: 'TA', name: 'தமிழ்' },
  ];

  useEffect(() => {
    if (!compact) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [compact]);

  const currentOpt = languageOptions.find(opt => opt.code === lang) || languageOptions[0];

  if (compact) {
    return (
      <div ref={containerRef} className={`relative inline-flex items-center shrink-0 ${className}`}>
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          title={`Language: ${currentOpt.name}`}
          aria-label="Select Language"
          className="h-8 sm:h-9 px-2 sm:px-2.5 bg-white border border-gray-200 text-gray-800 text-[11px] font-extrabold rounded-full shadow-xs hover:border-blue-400 transition cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
        >
          <span>{currentOpt.short}</span>
          <span className="text-[8px] opacity-60">▼</span>
        </button>

        {open && (
          <div className="theme-popover absolute right-0 top-full mt-2 w-36 rounded-xl shadow-2xl border border-gray-200 bg-white p-1.5 z-[300] space-y-0.5">
            {languageOptions.map(opt => {
              const active = opt.code === lang;
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => {
                    setLang(opt.code);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                    active ? 'bg-blue-600 text-white' : 'text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  <span>{opt.name}</span>
                  <span className="text-[10px] opacity-75">{opt.short}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative inline-flex items-center shrink-0 ${className}`}>
      <select
        value={lang}
        onChange={e => setLang(e.target.value as Language)}
        aria-label="Select Language"
        className="h-9 bg-white border border-gray-200 text-gray-800 text-xs font-bold rounded-lg pl-2.5 pr-6 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs appearance-none cursor-pointer hover:border-blue-400 transition whitespace-nowrap"
      >
        {languageOptions.map(opt => (
          <option key={opt.code} value={opt.code}>
            {opt.name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 text-gray-400 text-[9px]">
        ▼
      </span>
    </div>
  );
};
