import { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { MOCK_PRODUCTS, Product } from './data/mockProducts';
import { useLanguage, LanguageSelector } from './context/LanguageContext';

export default function AppStorefront() {
  const { t, lang } = useLanguage();

  // Synchronous instant initialization from cache + local mocks so page renders at 0ms
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const cachedRemote = localStorage.getItem('amal_cached_products');
      if (cachedRemote) {
        const parsed = JSON.parse(cachedRemote);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const customLocal = JSON.parse(localStorage.getItem('amal_custom_products') || '[]');
      return [...customLocal, ...MOCK_PRODUCTS];
    } catch {
      return MOCK_PRODUCTS;
    }
  });

  const [wishlist, setWishlist] = useState<Record<string, boolean>>(() => {
    try {
      const savedWishlistIds: string[] = JSON.parse(localStorage.getItem('amal_wishlist') || '[]');
      const wishMap: Record<string, boolean> = {};
      savedWishlistIds.forEach(id => { wishMap[id] = true; });
      return wishMap;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    let isMounted = true;

    // Track promoter referral code from URL e.g. ?ref=RAHUL100
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const refCode = urlParams.get('ref') || urlParams.get('promoter');
      if (refCode) {
        localStorage.setItem('amal_active_referral_code', refCode.toUpperCase().trim());
      }
    } catch {}

    const fetchProducts = async () => {
      try {
        // Use Promise.race with a 1.2s timeout so network delay never blocks the user
        const fetchPromise = getDocs(collection(db, 'products'));
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Network timeout')), 1200)
        );

        const querySnapshot = await Promise.race([fetchPromise, timeoutPromise]);
        if (!querySnapshot.empty && isMounted) {
          const fetched = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data.name || 'Amal Coolguard Vest',
              price: data.price || 2499,
              discountPrice: data.discountPrice || data.price || 1999,
              description: data.description || 'Cooling coat for heat protection.',
              imageUrl: data.imageUrl || 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=500',
              category: data.category || 'Coats',
              rating: data.rating || 4.7,
              reviewsCount: data.reviewsCount || 85,
            };
          });
          setProducts(fetched);
          try {
            localStorage.setItem('amal_cached_products', JSON.stringify(fetched));
          } catch {
            // ignore localStorage quota
          }
          return;
        }
      } catch (error) {
        // Handled silently - already rendered from instant local cache
      }

      if (isMounted) {
        const customLocal = JSON.parse(localStorage.getItem('amal_custom_products') || '[]');
        setProducts([...customLocal, ...MOCK_PRODUCTS]);
      }
    };

    fetchProducts();
    return () => { isMounted = false; };
  }, []);

  const toggleWishlist = (e: React.MouseEvent, productId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const isSaved = wishlist[productId];
    const newWishlist = { ...wishlist, [productId]: !isSaved };
    setWishlist(newWishlist);

    // Sync to localStorage
    const activeIds = Object.keys(newWishlist).filter(id => newWishlist[id]);
    localStorage.setItem('amal_wishlist', JSON.stringify(activeIds));
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Filter products by search and category
  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategory === 'All' || p.category?.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch = !searchQuery.trim() || 
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categories = ['All', 'Coats', 'Vests', 'Accessories'];
  const session = JSON.parse(localStorage.getItem('amal_customer_session') || 'null');
  const savedSettings = JSON.parse(localStorage.getItem('amal_payment_settings') || '{}');
  const whatsappNum = savedSettings.whatsappNumber || '6238113451';

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      {/* Header with Logo, Title, Language Selector & WhatsApp */}
      <nav className="bg-white px-3.5 py-2.5 shadow-sm sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img 
            src="/assets/aistudio/file_000000004d888211a2ae8deecb004de1_adbff682.png" 
            alt="Amal Coolguard Logo" 
            className="w-9 h-9 rounded-full border shadow-sm object-cover" 
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="leading-tight">
            <span className="text-sm font-black text-gray-900 tracking-tight flex items-center gap-1">
              <span>{t('brandName')}</span>
              <span className="text-[10px] text-blue-600 font-extrabold bg-blue-50 px-1 py-0.2 rounded border border-blue-100">
                {t('brandSubtitle')}
              </span>
            </span>
            <p className="text-[9.5px] text-gray-500 font-medium">{t('tagline')}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Prominent Language Switcher at the top */}
          <LanguageSelector />

          {session ? (
            <Link 
              to="/account" 
              className="flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-extrabold px-2 py-1.5 rounded-xl"
            >
              <span>👤</span>
              <span className="max-w-[55px] truncate">{session.name.split(' ')[0]}</span>
            </Link>
          ) : (
            <Link 
              to="/login" 
              className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-extrabold px-2.5 py-1.5 rounded-xl shadow transition"
            >
              {t('login')}
            </Link>
          )}

          <a 
            href={`https://wa.me/91${whatsappNum}?text=Hello%20Amal%20Coolguard,%20I%20have%20an%20enquiry%20about%20your%20cooling%20vests.`} 
            target="_blank" 
            rel="noreferrer"
            title="Chat with Amal Coolguard on WhatsApp"
            className="bg-emerald-500 hover:bg-emerald-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm shadow transition"
          >
            💬
          </a>
        </div>
      </nav>

      {/* Search Input Bar */}
      <div className="px-4 pt-3">
        <div className="relative">
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-2xl py-2.5 pl-9 pr-4 text-xs font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          />
          <span className="absolute left-3 top-2.5 text-gray-400 text-xs">🔍</span>
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Chips */}
      <div className="flex gap-2 px-4 pt-2.5 overflow-x-auto no-scrollbar">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`text-xs font-extrabold px-3.5 py-1.5 rounded-xl transition whitespace-nowrap shadow-xs ${
              selectedCategory === cat 
                ? 'bg-blue-600 text-white shadow' 
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {cat === 'All' ? t('allProducts') : cat}
          </button>
        ))}
      </div>

      {/* Active Promoter Referral Welcome Ribbon if visited via promoter link */}
      {(() => {
        const activePromoter = localStorage.getItem('amal_active_referral_code');
        if (!activePromoter) return null;
        return (
          <div className="mx-4 mt-3 bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 text-white p-3.5 rounded-2xl shadow-md border border-purple-500/40 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🤝</span>
              <div>
                <p className="text-xs font-black flex items-center gap-1.5">
                  <span>Referred by Creator:</span>
                  <span className="bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded-md font-mono text-[11px]">
                    {activePromoter}
                  </span>
                </p>
                <p className="text-[10px] text-purple-200">Official Amal Coolguard Partner Storefront</p>
              </div>
            </div>
            <span className="text-[10px] bg-white/20 text-white font-extrabold px-2.5 py-1 rounded-full uppercase">
              Special Offer Active
            </span>
          </div>
        );
      })()}

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 text-white p-5 mx-4 mt-3 rounded-2xl shadow-md">
        <span className="bg-white/20 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider mb-2 inline-block">
          {t('heroBadge')}
        </span>
        <h2 className="text-xl font-extrabold leading-tight mb-1">{t('heroTitle')}</h2>
        <p className="text-xs text-blue-100 mb-3">{t('heroDesc')}</p>
        <div className="flex gap-2">
          <span className="text-[11px] bg-white text-blue-800 font-bold px-3 py-1 rounded-lg">{t('heatBlock')}</span>
          <span className="text-[11px] bg-white text-blue-800 font-bold px-3 py-1 rounded-lg">{t('waterproof')}</span>
        </div>
      </div>

      {/* Products Section */}
      <main className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-base text-gray-900">{t('featuredTitle')}</h3>
          <span className="text-xs text-gray-500 font-medium">{filteredProducts.length} {t('productsCount')}</span>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="p-10 bg-white rounded-2xl text-center text-xs text-gray-500 border border-dashed border-gray-300">
            No products found matching "{searchQuery}".
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5">
            {filteredProducts.map(product => {
            const discountPercent = product.price && product.discountPrice 
              ? Math.round(((product.price - product.discountPrice) / product.price) * 100) 
              : 0;

            const isSavedInWishlist = wishlist[product.id];

            return (
              <Link 
                to={`/product/${product.id}`} 
                key={product.id} 
                className="bg-white p-3 rounded-2xl shadow-sm hover:shadow-md transition border border-gray-100 relative flex flex-col justify-between group"
              >
                {/* Prominent Heart / Wishlist Button */}
                <button 
                  onClick={e => toggleWishlist(e, product.id)}
                  title={isSavedInWishlist ? 'Remove from Wishlist' : 'Save to Wishlist'}
                  className={`absolute top-2.5 right-2.5 w-9 h-9 rounded-full flex items-center justify-center text-lg shadow-md z-10 transition transform active:scale-125 ${
                    isSavedInWishlist 
                      ? 'bg-red-50 text-red-600 border border-red-200 scale-105' 
                      : 'bg-white/90 text-gray-400 hover:text-red-500'
                  }`}
                >
                  {isSavedInWishlist ? '❤️' : '♡'}
                </button>

                <div>
                  <div className="w-full h-36 bg-gray-50 rounded-xl overflow-hidden mb-2.5">
                    <img 
                      src={product.imageUrl} 
                      alt={product.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300" 
                    />
                  </div>

                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full uppercase">
                    {product.category}
                  </span>

                  <h4 className="font-bold text-xs text-gray-900 mt-1.5 leading-snug line-clamp-2">
                    {product.name}
                  </h4>

                  <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-600">
                    <span className="bg-green-600 text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded">
                      {product.rating || 4.8} ★
                    </span>
                    <span className="text-[10px] text-gray-400">({product.reviewsCount || 45})</span>
                  </div>

                  <div className="flex items-baseline gap-1.5 mt-2">
                    <span className="text-sm font-extrabold text-gray-900">₹{product.discountPrice || product.price}</span>
                    {product.price && product.price > (product.discountPrice || 0) && (
                      <span className="text-[11px] text-gray-400 line-through">₹{product.price}</span>
                    )}
                  </div>

                  {discountPercent > 0 && (
                    <span className="text-[10px] font-bold text-green-700 block mt-0.5">
                      {discountPercent}% SPECIAL DISCOUNT
                    </span>
                  )}
                </div>

                <button 
                  className="w-full mt-3 bg-gradient-to-r from-orange-500 to-amber-600 text-white text-xs font-bold py-2 px-3 rounded-xl shadow hover:brightness-110 active:scale-98 transition flex items-center justify-center gap-1"
                >
                  <span>{t('orderNow')}</span>
                </button>
              </Link>
            );
          })}
        </div>
        )}
      </main>
    </div>
  );
}
