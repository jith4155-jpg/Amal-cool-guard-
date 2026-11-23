import { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot } from 'firebase/firestore';
import {
  db,
  mapProductFromDb,
  OperationType,
  handleFirestoreError,
} from './firebase';
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
  syncDeletedProductIds,
  safeJsonParse,
} from './utils/storeSync';

export default function AppStorefront() {
  const { t } = useLanguage();
  const { user, profile } = useAuth();

  const [products, setProducts] = useState<Product[]>(() => getCatalogProducts());
  const [customCategories, setCustomCategories] = useState<string[]>(() => getCategories());
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const wishlistKey = user ? `amal_wishlist_${user.uid}` : 'amal_wishlist_guest';
  const [wishlist, setWishlist] = useState<Record<string, boolean>>({});

  // Location selector state
  const [selectedLocation, setSelectedLocation] = useState<string>(() => localStorage.getItem('amal_user_location') || 'Kerala, India');
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationInput, setLocationInput] = useState('');

  useEffect(() => {
    try {
      const savedWishlistIds: string[] = safeJsonParse<string[]>(localStorage.getItem(wishlistKey), []);
      const wishMap: Record<string, boolean> = {};
      savedWishlistIds.forEach(id => {
        wishMap[id] = true;
      });
      setWishlist(wishMap);
    } catch {
      setWishlist({});
    }
  }, [wishlistKey]);

  useEffect(() => {
    let isMounted = true;

    syncReferralFromUrl(true);

    const handleStoreSync = () => {
      if (isMounted) {
        setProducts(getCatalogProducts());
        setCustomCategories(getCategories());
        setBrokenImages({});
      }
    };
    window.addEventListener('amal_store_updated', handleStoreSync);
    window.addEventListener('storage', handleStoreSync);

    const loadRemoteCatalogAndSettings = async () => {
      try {
        const [catSnap, catalogSnap, prodSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'categories')),
          getDoc(doc(db, 'settings', 'catalog')),
          getDocs(collection(db, 'products')),
        ]);

        if (!isMounted) return;

        if (catalogSnap.exists()) {
          const catData = catalogSnap.data();
          if (Array.isArray(catData?.deletedIds)) {
            syncDeletedProductIds(catData.deletedIds);
          }
        }

        if (catSnap.exists()) {
          const catData = catSnap.data();
          if (Array.isArray(catData?.list)) {
            const synced = saveCategories(catData.list);
            setCustomCategories(synced);
          }
        }

        const fetched: Product[] = prodSnap.docs.map(d => mapProductFromDb(d.data(), d.id));
        const merged = mergeRemoteCatalogProducts(fetched);
        if (isMounted) {
          setProducts(merged);
          setBrokenImages({});
        }
      } catch (err) {
        console.warn('Firestore storefront load warning:', err);
      }
    };

    loadRemoteCatalogAndSettings();

    const unsubProducts = onSnapshot(
      collection(db, 'products'),
      snap => {
        if (!isMounted) return;
        const fetched = snap.docs.map(d => mapProductFromDb(d.data(), d.id));
        const merged = mergeRemoteCatalogProducts(fetched);
        setProducts(merged);
        setBrokenImages({});
      },
      error => {
        handleFirestoreError(error, OperationType.LIST, 'products');
      }
    );

    const unsubCategories = onSnapshot(
      doc(db, 'settings', 'categories'),
      snap => {
        if (!isMounted || !snap.exists()) return;
        const data = snap.data();
        if (Array.isArray(data?.list)) {
          const synced = saveCategories(data.list);
          setCustomCategories(synced);
        }
      },
      error => {
        handleFirestoreError(error, OperationType.GET, 'settings/categories');
      }
    );

    const unsubCatalog = onSnapshot(
      doc(db, 'settings', 'catalog'),
      snap => {
        if (!isMounted || !snap.exists()) return;
        const data = snap.data();
        if (Array.isArray(data?.deletedIds)) {
          syncDeletedProductIds(data.deletedIds);
          setProducts(getCatalogProducts());
        }
      },
      error => {
        handleFirestoreError(error, OperationType.GET, 'settings/catalog');
      }
    );

    return () => {
      isMounted = false;
      unsubProducts();
      unsubCategories();
      unsubCatalog();
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

  const validCategoryNames = customCategories.filter(
    c => Boolean(c) && products.some(p => p.category?.trim().toLowerCase() === c.trim().toLowerCase())
  );
  const categories = validCategoryNames.length > 0 ? ['All', ...validCategoryNames] : ['All'];

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
  const firstName = (profile?.name || user?.displayName || user?.email || 'Account').split(' ')[0];

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      {/* Location Selector Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between text-xs font-semibold text-gray-700">
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-blue-600 font-bold">📍</span>
          <span className="text-gray-500">Location:</span>
          <button
            type="button"
            onClick={() => setShowLocationModal(true)}
            className="text-blue-700 font-bold underline hover:text-blue-800 truncate"
          >
            {selectedLocation}
          </button>
        </div>
        <span className="text-[10px] text-gray-400">Kerala, India</span>
      </div>

      {/* Prominent Flipkart-Style Header with Logo and Larger Brand Name */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <Link to="/" className="flex items-center gap-3 min-w-0 shrink">
              <img
                src="/assets/aistudio/file_000000004d888211a2ae8deecb004de1_adbff682.png"
                alt="Amal Coolguard"
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-blue-600 object-cover shadow-sm shrink-0"
                onError={e => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div className="flex flex-col min-w-0">
                <span className="text-base sm:text-xl font-extrabold text-blue-700 tracking-tight whitespace-nowrap truncate">
                  {t('brandName')}
                </span>
                <span className="text-[10px] sm:text-xs font-bold text-gray-500 truncate">
                  {t('tagline') || 'Sun Protection Gear'}
                </span>
              </div>
            </Link>

            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <ThemeSwitcher compact />
              <LanguageSelector />

              {user ? (
                <Link
                  to="/account"
                  title={profile?.email || user.email || 'My Profile'}
                  className="h-9 inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-extrabold px-2 sm:px-3 rounded-lg hover:bg-blue-100 transition whitespace-nowrap shrink-0"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={firstName}
                      className="w-5 h-5 rounded-full object-cover border border-blue-300 shrink-0"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                      {firstName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="max-w-[70px] sm:max-w-[115px] truncate">{firstName}</span>
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="h-9 inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 sm:px-4 rounded-lg shadow-xs transition whitespace-nowrap shrink-0"
                >
                  {t('login')}
                </Link>
              )}

              <a
                href={`https://wa.me/91${whatsappNum}?text=Hello%20Amal%20Coolguard,%20I%20have%20an%20enquiry.`}
                target="_blank"
                rel="noreferrer"
                title="WhatsApp Support"
                aria-label="WhatsApp Support"
                className="w-9 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center shadow-xs transition shrink-0"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.6 14.1c-.2.6-1.3 1.1-1.9 1.2-.5.1-1.1.1-1.8-.1a14 14 0 0 1-5.8-3.6 10.6 10.6 0 0 1-2.2-3.4c-.3-.8 0-1.6.5-2.1.3-.3.7-.5 1-.5h.7c.2 0 .5 0 .7.5l.9 2.1c.1.2.1.5 0 .7l-.4.6c-.2.2-.3.4-.1.7.4.7 1 1.4 1.7 2 .8.7 1.6 1.2 2.4 1.5.3.1.5 0 .7-.2l.7-.8c.2-.2.5-.3.8-.2l2 .9c.4.2.5.4.5.7 0 .3-.1.8-.4 1.3Z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Flipkart-Style Search Bar */}
          <div className="pt-2.5">
            <div className="relative flex items-center">
              <svg
                className="w-4 h-4 text-gray-400 absolute left-3.5 pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-10 bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-9 text-xs sm:text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Flipkart-Style Category Icon Rail */}
      <div className="bg-white border-b border-gray-200 px-3 py-3 overflow-x-auto no-scrollbar shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center gap-4 sm:gap-6 min-w-max">
          {[
            { name: 'For You', icon: '🛍️' },
            { name: 'Coats', icon: '🧥' },
            { name: 'Vests', icon: '🦺' },
            { name: 'Sun Protection', icon: '☀️' },
            { name: 'Accessories', icon: '🛡️' },
            { name: 'Kerala Special', icon: '🌴' },
          ].map(cat => {
            const active = selectedCategory === (cat.name === 'For You' ? 'All' : cat.name);
            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => setSelectedCategory(cat.name === 'For You' ? 'All' : cat.name)}
                className="flex flex-col items-center gap-1.5 group cursor-pointer"
              >
                <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-xl sm:text-2xl transition shadow-xs border ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300'
                    : 'bg-gray-50 text-gray-700 border-gray-200 group-hover:bg-blue-50 group-hover:border-blue-200'
                }`}>
                  {cat.icon}
                </div>
                <span className={`text-[11px] font-bold transition ${active ? 'text-blue-600' : 'text-gray-700 group-hover:text-blue-600'}`}>
                  {cat.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Store Container */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 space-y-4">
        {/* Promotional Banner */}
        {products.length > 0 && (
          <section className="bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 text-white px-5 py-5 sm:px-8 sm:py-7 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <span className="bg-white/20 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider">
                {t('heroBadge')}
              </span>
              <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight leading-tight">
                {t('heroTitle')}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100 font-medium">
                {t('heroDesc')}
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-xs font-semibold text-blue-50 shrink-0">
              <span className="bg-blue-800/50 px-3 py-1.5 rounded-lg border border-blue-400/30">{t('heatBlock')}</span>
              <span className="bg-blue-800/50 px-3 py-1.5 rounded-lg border border-blue-400/30">{t('waterproof')}</span>
            </div>
          </section>
        )}

        {/* Product Catalog Section */}
        <main className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-extrabold text-sm sm:text-lg text-gray-900 tracking-tight">
              {selectedCategory === 'All' ? t('featuredTitle') : selectedCategory}
            </h2>
            <span className="text-xs text-gray-500 font-semibold tabular-nums whitespace-nowrap shrink-0">
              {filteredProducts.length} {t('productsCount')}
            </span>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="py-16 px-4 bg-white rounded-2xl border border-dashed border-gray-300 text-center space-y-4 max-w-md mx-auto my-4 shadow-2xs">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 text-3xl rounded-full flex items-center justify-center mx-auto shadow-inner">
                🛍️
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-base text-gray-900">
                  {searchQuery ? `No products matching "${searchQuery}".` : 'ഉൽപ്പന്നങ്ങൾ ലഭ്യമല്ല (No Products)'}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {searchQuery ? 'Try another search term.' : 'Add your products from the Admin Panel.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
              {filteredProducts.map(product => {
                const totals = calculateProductTotals(product);
                const totalWithExtras = totals.finalTotal;
                const discountPercent =
                  totals.originalBase > totals.basePrice
                    ? Math.round(((totals.originalBase - totals.basePrice) / totals.originalBase) * 100)
                    : 0;
                const isSavedInWishlist = wishlist[product.id];
                const imgBroken = brokenImages[product.id] || !product.imageUrl;

                return (
                  <Link
                    to={`/product/${product.id}`}
                    key={product.id}
                    className="bg-white rounded-xl border border-gray-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition duration-150 flex flex-col justify-between overflow-hidden group"
                  >
                    <div>
                      <div className="relative aspect-[4/3] sm:aspect-square w-full bg-gray-50 overflow-hidden border-b border-gray-100">
                        {!imgBroken ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            referrerPolicy="no-referrer"
                            onError={() => setBrokenImages(prev => ({ ...prev, [product.id]: true }))}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-gray-400">
                            <span className="text-[11px] font-semibold line-clamp-1">{product.name}</span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={e => toggleWishlist(e, product.id)}
                          title={isSavedInWishlist ? 'Remove from Wishlist' : 'Save to Wishlist'}
                          aria-label={isSavedInWishlist ? 'Remove from Wishlist' : 'Save to Wishlist'}
                          className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-sm z-10 transition active:scale-110 border ${
                            isSavedInWishlist
                              ? 'bg-red-50 text-red-600 border-red-200'
                              : 'bg-white/90 text-gray-500 border-gray-200 hover:text-red-500'
                          }`}
                        >
                          {isSavedInWishlist ? '♥' : '♡'}
                        </button>
                      </div>

                      <div className="p-3 sm:p-4 space-y-1.5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 truncate">
                          {product.category}
                        </p>

                        <h3 className="font-bold text-xs sm:text-sm text-gray-900 leading-snug line-clamp-2 min-h-[2.3rem] sm:min-h-[2.6rem]">
                          {product.name}
                        </h3>

                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 flex-wrap">
                          <span className="bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums">
                            {product.rating || 4.8} ★
                          </span>
                          <span className="tabular-nums">({product.reviewsCount || 45})</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-emerald-700 truncate">
                            {totals.deliveryFee > 0 ? `+₹${totals.deliveryFee} Del.` : t('freeDelivery')}
                          </span>
                        </div>

                        <div className="flex items-baseline gap-1.5 pt-1 flex-wrap tabular-nums">
                          <span className="text-base sm:text-lg font-extrabold text-gray-900">
                            ₹{totalWithExtras}
                          </span>
                          {totals.originalTotal > totalWithExtras && (
                            <span className="text-xs text-gray-400 line-through">
                              ₹{totals.originalTotal}
                            </span>
                          )}
                          {discountPercent > 0 && (
                            <span className="text-[11px] font-bold text-emerald-700">
                              {discountPercent}% {t('specialDiscount')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="px-3 pb-3 sm:px-4 sm:pb-4 pt-0">
                      <span className="h-9 w-full bg-blue-600 group-hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition flex items-center justify-center whitespace-nowrap">
                        {t('orderNow')}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-extrabold text-gray-900">Set Delivery Location</h3>
            <p className="text-xs text-gray-500">Enter your delivery city or pincode in Kerala / India:</p>
            <input
              type="text"
              placeholder="e.g. Kozhikode, Kochi, 673574"
              value={locationInput}
              onChange={e => setLocationInput(e.target.value)}
              className="w-full h-11 bg-gray-50 border border-gray-200 rounded-xl px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLocationModal(false)}
                className="flex-1 h-10 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (locationInput.trim()) {
                    setSelectedLocation(locationInput.trim());
                    localStorage.setItem('amal_user_location', locationInput.trim());
                  }
                  setShowLocationModal(false);
                }}
                className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
              >
                Save Location
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
