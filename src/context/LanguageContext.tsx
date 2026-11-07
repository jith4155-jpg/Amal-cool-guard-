import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'ml' | 'en' | 'hi' | 'ta';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  ml: {
    // Brand & Header
    brandName: 'Amal Coolguard',
    brandSubtitle: 'അമൽ കൂൾഗാർഡ്',
    tagline: 'ഹീറ്റ് പ്രൊട്ടക്ഷൻ ഗിയർ • കേരളം',
    searchPlaceholder: 'കൂളിംഗ് കോട്ടുകൾ, വെസ്റ്റുകൾ തിരയുക...',
    allProducts: '🌟 എല്ലാ ഉൽപ്പന്നങ്ങളും',
    featuredTitle: 'ഹീറ്റ് പ്രൊട്ടക്ഷൻ കോട്ടുകളും വെസ്റ്റുകളും',
    productsCount: 'ഉൽപ്പന്നങ്ങൾ',
    orderNow: 'ഓർഡർ ചെയ്യുക',
    specialDiscount: 'പ്രത്യേക കിഴിവ്',
    heroBadge: 'ഔദ്യോഗിക സൺ പ്രൊട്ടക്ഷൻ ഗിയർ',
    heroTitle: 'അമൽ കൂൾഗാർഡ് വെസ്റ്റുകൾ',
    heroDesc: 'കേരളത്തിലെ കടുത്ത വെയിലിനെ പ്രതിരോധിക്കാം • ബൈക്ക് യാത്രികർക്കും തൊഴിലാളികൾക്കും അനുയോജ്യം',
    heatBlock: '✓ 90% ചൂട് തടയുന്നു',
    waterproof: '✓ വാട്ടർപ്രൂഫ്',
    login: 'ലോഗിൻ',
    logout: 'ലോഗൗട്ട്',
    account: 'അക്കൗണ്ട്',
    orders: 'ഓർഡറുകൾ',
    home: 'ഹോം',
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
  },
  en: {
    brandName: 'Amal Coolguard',
    brandSubtitle: 'Sun Protection',
    tagline: 'Heat Protection Gear • Kerala',
    searchPlaceholder: 'Search cooling vests, coats, sun gear...',
    allProducts: '🌟 All Products',
    featuredTitle: 'Featured Cooling Vests & Coats',
    productsCount: 'Products',
    orderNow: 'Order Now',
    specialDiscount: 'SPECIAL DISCOUNT',
    heroBadge: 'Official Sun Protection Gear',
    heroTitle: 'AMAL COOLGUARD VESTS',
    heroDesc: 'Beats Kerala Sun Heat • Heat Reflective Coat for Bike Riders & Outdoor Workers',
    heatBlock: '✓ 90% Heat Block',
    waterproof: '✓ Waterproof',
    login: 'Login',
    logout: 'Logout',
    account: 'Account',
    orders: 'Orders',
    home: 'Home',
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
  },
  hi: {
    brandName: 'Amal Coolguard',
    brandSubtitle: 'अमल कूलगार्ड',
    tagline: 'हीट प्रोटेक्शन गियर • केरल',
    searchPlaceholder: 'कूलिंग वेस्ट और कोट खोजें...',
    allProducts: '🌟 सभी उत्पाद',
    featuredTitle: 'विशेष कूलिंग वेस्ट और कोट',
    productsCount: 'उत्पाद',
    orderNow: 'अभी ऑर्डर करें',
    specialDiscount: 'विशेष छूट',
    heroBadge: 'आधिकारिक धूप सुरक्षा गियर',
    heroTitle: 'अमल कूलगार्ड वेस्ट्स',
    heroDesc: 'केरल की तेज धूप से राहत • बाइक राइडर्स और कामगारों के लिए हीट रिफ्लेक्टिव कोट',
    heatBlock: '✓ 90% गर्मी से बचाव',
    waterproof: '✓ वाटरप्रूफ',
    login: 'लॉग इन',
    logout: 'लॉग आउट',
    account: 'खाता',
    orders: 'आदेश',
    home: 'होम',
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
  },
  ta: {
    brandName: 'Amal Coolguard',
    brandSubtitle: 'அமல் கூல்கார்ட்',
    tagline: 'வெப்ப பாதுகாப்பு கியர் • கேரளா',
    searchPlaceholder: 'கூலிங் கோட்கள் மற்றும் ஆடைகளைத் தேடுங்கள்...',
    allProducts: '🌟 அனைத்து பொருட்கள்',
    featuredTitle: 'சிறப்பு கூலிங் கோட்கள் & வெஸ்ட்கள்',
    productsCount: 'பொருட்கள்',
    orderNow: 'இப்போதே ஆர்டர் செய்',
    specialDiscount: 'சிறப்பு தள்ளுபடி',
    heroBadge: 'அதிகாரப்பூர்வ சூரிய பாதுகாப்பு கியர்',
    heroTitle: 'அமல் கூல்கார்ட் வெஸ்ட்கள்',
    heroDesc: 'கடுமையான வெயிலை வெல்லுங்கள் • பைக் ஓட்டுநர்கள் மற்றும் தொழிலாளர்களுக்கான சிறப்பு கோட்',
    heatBlock: '✓ 90% வெப்பத் தடுப்பு',
    waterproof: '✓ நீர்ப்புகா',
    login: 'உள்நுழைவு',
    logout: 'வெளியேறு',
    account: 'கணக்கு',
    orders: 'ஆர்டர்கள்',
    home: 'முகப்பு',
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
  }
};

const LanguageContext = createContext<LanguageContextType>({
  lang: 'ml',
  setLang: () => {},
  t: (key: string) => key,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('amal_app_language') as Language;
      if (saved && ['ml', 'en', 'hi', 'ta'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'ml'; // Default Malayalam as requested
  });

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem('amal_app_language', newLang);
    } catch {}
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

export const LanguageSelector: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { lang, setLang } = useLanguage();

  const languageOptions = [
    { code: 'ml', name: 'മലയാളം', flag: '🌴' },
    { code: 'en', name: 'English', flag: '🌐' },
    { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
    { code: 'ta', name: 'தமிழ்', flag: '🪷' },
  ];

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Language)}
        aria-label="Select Language"
        className="bg-white border border-gray-200 text-gray-800 text-[11px] font-extrabold rounded-xl py-1.5 pl-2.5 pr-7 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs appearance-none cursor-pointer hover:border-blue-300 transition"
      >
        {languageOptions.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.flag} {opt.name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 text-gray-400 text-[10px]">
        ▼
      </span>
    </div>
  );
};
