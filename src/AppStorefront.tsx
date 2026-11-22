import { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Product } from './data/mockProducts';
import { useLanguage, LanguageSelector } from './context/LanguageContext';
import { ThemeSwitcher } from './context/ThemeContext';
import { useAuth } from './context/AuthContext';
import {
  getCatalogProducts,
  mergeRemoteCatalogProducts,
  syncReferralFromUrl,
  getCategories,
  saveCategories,
  calculateProductTotals,
  safeJsonParse,
} from './utils/storeSync';

export default function AppStorefront() {
  const { t } = useLanguage();
  const { user, profile } = useAuth();

  // Instant initialization from unified Admin-synced catalog
  const [products, setProducts] = useState<Product[]>(() => getCatalogProducts());
  const [customCategories, setCustomCategories] = useState<string[]>(() => getCategories());

  const wishlistKey = user ? `amal_wishlist_${user.uid}` : 'amal_wishlist_guest';

  const [wishlist, setWishlist] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const savedWishlistIds: string[] = safeJsonParse<string[]>(localStorage.getItem(wishlistKey), []);
      const wishMap: Record<string, boolean> = {};
      savedWishlistIds.forEach(id => { wishMap[id] = true; });
      setWishlist(wishMap);
    } catch {
      setWishlist({});
    }
  }, [wishlistKey]);

  useEffect(() => {
    let isMounted = true;

    // Silently record referral ID from URL (?L01N) without showing any promotion UI
    syncReferralFromUrl(true);

    const handleStoreSync = () => {
      if (isMounted) {
        setProducts(getCatalogProducts());
        setCustomCategories(getCategories());
      }
    };
    window.addEventListener('amal_store_updated', handleStoreSync);
    window.addEventListener('storage', handleStoreSync);

    const fetchCategoriesRemote = async () => {
      try {
        const snap = await Promise.race([
          getDoc(doc(db, 'settings', 'categories')),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1200)),
        ]);
        if (snap.exists() && Array.isArray(snap.data().list) && isMounted) {
          const synced = saveCategories(snap.data().list);
          setCustomCategories(synced);
        }
      } catch {
        // local categories already loaded
      }
    };

    const fetchProducts = async () => {
      try {
        const fetchPromise = getDocs(collection(db, 'products'));
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Network timeout')), 1200)
        );

        const querySnapshot = await Promise.race([fetchPromise, timeoutPromise]);
        if (!querySnapshot.empty && isMounted) {
          const fetched: Product[] = querySnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              name: data.name || 'Amal Coolguard Vest',
              price: Number(data.price) || 2499,
              discountPrice: Number(data.discountPrice || data.price) || 1999,
              description: data.description || 'Cooling coat for heat protection.',
              imageUrl: data.imageUrl || 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=500',
              galleryImages: Array.isArray(data.galleryImages) ? data.galleryImages : undefined,
              category: data.category || 'Coats',
              rating: Number(data.rating) || 4.7,
              reviewsCount: Number(data.reviewsCount) || 85,
              features: Array.isArray(data.features) ? data.features : undefined,
              stock: typeof data.stock === 'number' ? data.stock : undefined,
              gstPercent: typeof data.gstPercent === 'number' ? data.gstPercent : 0,
              deliveryCharge: typeof data.deliveryCharge === 'number' ? data.deliveryCharge : 0,
              estimatedDeliveryDays: typeof data.estimatedDeliveryDays === 'string' ? data.estimatedDeliveryDays : '',
            };
          });
          const merged = mergeRemoteCatalogProducts(fetched);
          if (isMounted) setProducts(merged);
          return;
        }
      } catch {
        // Handled silently - already rendered from unified local catalog
      }

      if (isMounted) {
        setProducts(getCatalogProducts());
      }
    };

    fetchCategoriesRemote();
    fetchProducts();
    return () => {
      isMounted = false;
      window.removeEventListener('amal_store_updated', handleStoreSync);
      window.removeEventListener('storage', handleStoreSync);
    };
  }, []);

  const toggleWishlist = (e: React.MouseEvent, productId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const isSaved = wishlist[productId];
    const newWishlist = { ...wishlist, [productId]: !isSaved };
    setWishlist(newWishlist);

    const activeIds = Object.keys(newWishlist).filter(id => newWishlist[id]);
    localStorage.setItem(wishlistKey, JSON.stringify(activeIds));
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Top Category bar displays ONLY the categories configured/added in Admin
  const allCustomCategoryNames = Array.from(new Set(customCategories.map(c => c.trim()).filter(Boolean)));
  const categories = ['All', ...allCustomCategoryNames];

  // Categories matching current search input so typing a category name highlights & selects it easily
  const matchingSearchedCategories = searchQuery.trim()
    ? allCustomCategoryNames.filter(c => c.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : [];

  // Filter products by search and selected category
  const filteredProducts = products.filter(p => {
    const matchesCategory =
      selectedCategory === 'All' || p.category?.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch =
      !searchQuery.trim() ||
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const savedSettings = safeJsonParse<Record<string, any>>(localStorage.getItem('amal_payment_settings'), {});
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
            onError={e => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="leading-tight">
            <span className="text-sm font-black text-gray-900 tracking-tight">
              Amal Coolguard
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Eye-Comfort Theme Switcher (5 Colors) */}
          <ThemeSwitcher compact />

          {/* Prominent Language Switcher at the top */}
          <LanguageSelector />

          {user ? (
            <Link
              to="/account"
              className="flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-extrabold px-2 py-1.5 rounded-xl"
            >
              <span>👤</span>
              <span className="max-w-[55px] truncate">
                {(profile?.name || user.displayName || user.email || 'User').split(' ')[0]}
              </span>
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

      {/* Category Filter Chips at top of screen */}
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

      {/* Matching Categories Quick-Jump when searching */}
      {matchingSearchedCategories.length > 0 && (
        <div className="px-4 pt-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[10px] font-bold text-gray-500 whitespace-nowrap">Categories:</span>
          {matchingSearchedCategories.map(cat => (
            <button
              key={cat}
              onClick={() => {
                setSelectedCategory(cat);
                setSearchQuery('');
              }}
              className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-extrabold px-3 py-1 rounded-full whitespace-nowrap hover:bg-indigo-100 transition"
            >
              📂 {cat}
            </button>
          ))}
        </div>
      )}

      {/* Clean Hero Banner: Amal Coolguard + English Sun Protection Cooling line only */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 text-white p-5 mx-4 mt-3 rounded-2xl shadow-md">
        <h2 className="text-xl font-extrabold leading-tight">Amal Coolguard</h2>
        <p className="text-xs text-blue-100 font-semibold mt-1">
          Sun Protection Cooling Gear
        </p>
      </div>

      {/* Products Section */}
      <main className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-base text-gray-900">
            {selectedCategory === 'All' ? t('featuredTitle') : selectedCategory}
          </h3>
          <span className="text-xs text-gray-500 font-medium">
            {filteredProducts.length} {t('productsCount')}
          </span>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="p-10 bg-white rounded-2xl text-center text-xs text-gray-500 border border-dashed border-gray-300 space-y-2">
            <p>
              {searchQuery
                ? `No products found matching "${searchQuery}".`
                : `No products found in "${selectedCategory}" category yet.`}
            </p>
            {selectedCategory !== 'All' && (
              <button
                onClick={() => setSelectedCategory('All')}
                className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl"
              >
                Show All Products
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5">
            {filteredProducts.map(product => {
              const totals = calculateProductTotals(product);
              const totalWithExtras = totals.finalTotal;

              const discountPercent =
                totals.originalBase > totals.basePrice
                  ? Math.round(((totals.originalBase - totals.basePrice) / totals.originalBase) * 100)
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
                      <span className="text-sm font-extrabold text-gray-900">
                        ₹{totalWithExtras}
                      </span>
                      {totals.originalTotal > totalWithExtras && (
                        <span className="text-[11px] text-gray-400 line-through">₹{totals.originalTotal}</span>
                      )}
                    </div>

                    {totals.gstPercent > 0 && (
                      <span className="text-[10px] font-bold text-amber-700 block mt-0.5">
                        +{totals.gstPercent}% GST (₹{totals.gstAmount})
                      </span>
                    )}

                    {totals.deliveryFee > 0 ? (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded inline-block mt-1">
                        🚚 +₹{totals.deliveryFee} Delivery
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded inline-block mt-1">
                        🚚 Free Delivery
                      </span>
                    )}

                    {product.estimatedDeliveryDays && (
                      <span className="text-[10px] font-bold text-gray-500 block mt-0.5">
                        ⏱️ Delivery: {product.estimatedDeliveryDays}
                      </span>
                    )}

                    {discountPercent > 0 && (
                      <span className="text-[10px] font-bold text-green-700 block mt-0.5">
                        {discountPercent}% {t('specialDiscount')}
                      </span>
                    )}
                  </div>

                  <button className="w-full mt-3 bg-gradient-to-r from-orange-500 to-amber-600 text-white text-xs font-bold py-2 px-3 rounded-xl shadow hover:brightness-110 active:scale-98 transition flex items-center justify-center gap-1">
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
